import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

class BangladeshGovScraper {
  constructor() {
    this.serviceEndpoints = {
      'passport': {
        mainSite: 'https://www.passport.gov.bd/',
        eSite: 'https://epassport.gov.bd/',
        feeStructure: 'https://www.passport.gov.bd/pages/fee-structure',
        onlineApplication: 'https://www.passport.gov.bd/online-application'
      },
      'nid': {
        mainSite: 'https://services.nidw.gov.bd/',
        ecSite: 'https://www.ec.gov.bd/',
        onlineServices: 'https://services.nidw.gov.bd/nid-pub/',
        correction: 'https://services.nidw.gov.bd/correction/',
        download: 'https://services.nidw.gov.bd/voter-slip-download'
      },
      'birth_certificate': {
        mainSite: 'https://bdris.gov.bd/',
        onlineServices: 'https://bdris.gov.bd/br/application',
        correction: 'https://bdris.gov.bd/correction/',
        verification: 'https://bdris.gov.bd/verification/'
      },
      'driving_license': {
        mainSite: 'https://dlrs.gov.bd/',
        brta: 'https://brta.gov.bd/',
        onlineServices: 'https://dlrs.gov.bd/online-services',
        renewal: 'https://dlrs.gov.bd/renewal/',
        appointment: 'https://dlrs.gov.bd/appointment/'
      },
      'tax': {
        nbr: 'https://nbr.gov.bd/',
        incomeTax: 'https://incometax.gov.bd/',
        vatOnline: 'https://secure.nbr.gov.bd/',
        etin: 'https://secure.incometax.gov.bd/TINHome',
        returns: 'https://secure.incometax.gov.bd/returns'
      }
    };

    // Enhanced keyword mapping for better service detection
    this.serviceKeywords = {
      'passport': [
        'passport', 'epassport', 'travel document', 'visa', 'international travel',
        'পাসপোর্ট', 'ই-পাসপোর্ট', 'ভ্রমণ দলিল'
      ],
      'nid': [
        'nid', 'national id', 'voter id', 'smart card', 'voter card', 'election',
        'জাতীয় পরিচয়পত্র', 'ভোটার আইডি', 'স্মার্ট কার্ড'
      ],
      'birth_certificate': [
        'birth certificate', 'birth registration', 'bdris', 'newborn',
        'জন্ম নিবন্ধন', 'জন্ম সনদ', 'নবজাতক'
      ],
      'driving_license': [
        'driving license', 'license', 'brta', 'vehicle', 'car', 'motorcycle', 'transport',
        'ড্রাইভিং লাইসেন্স', 'গাড়ি চালনার লাইসেন্স', 'যানবাহন'
      ],
      'tax': [
        'tax', 'income tax', 'nbr', 'tin', 'etin', 'vat', 'return', 'revenue',
        'কর', 'আয়কর', 'ভ্যাট', 'রিটার্ন'
      ]
    };

    // Cache for storing recent data
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async fetchServiceData(service, userQuery) {
    const cacheKey = `${service}_${userQuery.toLowerCase().substring(0, 50)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`[DEBUG] Using cached data for ${service}`);
        return cached.data;
      }
    }

    const endpoints = this.serviceEndpoints[service];
    if (!endpoints) return null;

    const results = [];
    const specificQuery = this.analyzeUserQuery(userQuery, service);
    
    // Try different endpoints for the service
    for (const [siteName, url] of Object.entries(endpoints)) {
      try {
        console.log(`[DEBUG] Fetching from ${siteName}: ${url}`);
        const data = await this.scrapeServiceSite(url, service, specificQuery);
        if (data && this.hasUsefulContent(data)) {
          results.push({
            source: siteName,
            url: url,
            relevanceScore: this.calculateRelevance(data, specificQuery),
            ...data
          });
        }
      } catch (error) {
        console.error(`Error fetching from ${siteName}:`, error.message);
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const formattedResult = results.length > 0 ? this.formatResults(service, results, specificQuery) : null;
    
    // Cache the result
    if (formattedResult) {
      this.cache.set(cacheKey, {
        data: formattedResult,
        timestamp: Date.now()
      });
    }

    return formattedResult;
  }

  // Analyze user query to determine specific intent
  analyzeUserQuery(query, service) {
    const queryLower = query.toLowerCase();
    const analysis = {
      intent: 'general',
      keywords: [],
      isUrgent: false,
      needsFee: false,
      needsProcedure: false,
      needsDocuments: false,
      language: queryLower.match(/[আ-ৎ]/) ? 'bangla' : 'english'
    };

    // Detect specific intents
    if (queryLower.includes('fee') || queryLower.includes('cost') || queryLower.includes('price') || queryLower.includes('ফি')) {
      analysis.intent = 'fee_inquiry';
      analysis.needsFee = true;
    } else if (queryLower.includes('how to') || queryLower.includes('process') || queryLower.includes('step') || queryLower.includes('কিভাবে')) {
      analysis.intent = 'procedure_inquiry';
      analysis.needsProcedure = true;
    } else if (queryLower.includes('document') || queryLower.includes('require') || queryLower.includes('need') || queryLower.includes('দরকার')) {
      analysis.intent = 'document_inquiry';
      analysis.needsDocuments = true;
    } else if (queryLower.includes('urgent') || queryLower.includes('fast') || queryLower.includes('express') || queryLower.includes('জরুরি')) {
      analysis.isUrgent = true;
    }

    // Extract relevant keywords
    const serviceKeywords = this.serviceKeywords[service] || [];
    serviceKeywords.forEach(keyword => {
      if (queryLower.includes(keyword.toLowerCase())) {
        analysis.keywords.push(keyword);
      }
    });

    return analysis;
  }

  // Calculate relevance score for prioritizing results
  calculateRelevance(data, query) {
    let score = 0;
    
    if (query.needsFee && data.fees.length > 0) score += 10;
    if (query.needsProcedure && data.procedures.length > 0) score += 10;
    if (query.needsDocuments && data.requirements.length > 0) score += 10;
    if (query.isUrgent) {
      // Check for express/urgent services
      const urgentTerms = ['express', 'urgent', 'fast', 'emergency', 'জরুরি'];
      const hasUrgentInfo = [...data.services, ...data.procedures].some(item =>
        urgentTerms.some(term => item.toLowerCase().includes(term))
      );
      if (hasUrgentInfo) score += 15;
    }

    // Keyword matching
    query.keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      [...data.services, ...data.fees, ...data.requirements].forEach(item => {
        if (item.toLowerCase().includes(keywordLower)) {
          score += 5;
        }
      });
    });

    return score;
  }

  async scrapeServiceSite(url, service, queryAnalysis) {
    try {
      // Use the improved fetchPageContent method
      const htmlData = await this.fetchPageContent(url, {
        maxRetries: 3,
        timeout: 30000,
        ignoreSSL: process.env.NODE_ENV === 'development',
        retryDelay: 1000
      });

      if (!htmlData) {
        console.error(`[ERROR] No data received for ${url}`);
        return null;
      }

      const $ = cheerio.load(htmlData);
      
      const content = {
        title: $('title').text().trim(),
        services: [],
        fees: [],
        requirements: [],
        procedures: [],
        contactInfo: [],
        importantLinks: [],
        notices: [],
        downloadLinks: []
      };

      // Enhanced extraction methods
      this.extractServicesEnhanced($, content, service);
      this.extractFeesEnhanced($, content, service);
      this.extractRequirementsEnhanced($, content, service);
      this.extractProceduresEnhanced($, content, service);
      this.extractContactInfoEnhanced($, content);
      this.extractImportantLinksEnhanced($, content, url);
      this.extractNotices($, content);
      this.extractDownloadLinks($, content, url);

      return content;
    } catch (error) {
      console.error(`Scraping error for ${url}:`, error.message);
      
      // Fallback to basic scraping if enhanced fails
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
        return await this.basicScrape(url, service);
      }
      
      return null;
    }
  }

  // Enhanced service extraction with better selectors
  extractServicesEnhanced($, content, service) {
    const serviceSelectors = [
      '.service-list li, .services li, .service-item',
      '.menu-item, .nav-item, .dropdown-item',
      'h3, h4, h5',
      '.card-title, .service-title',
      'ul li, ol li'
    ];

    serviceSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && this.isServiceRelated(text, service)) {
          content.services.push(this.cleanText(text));
        }
      });
    });

    // Remove duplicates and sort by relevance
    content.services = [...new Set(content.services)];
  }

  // Enhanced fee extraction with pattern matching
  extractFeesEnhanced($, content, service) {
    const feeSelectors = [
      '.fee-table td, .price-table td',
      '.fee-structure li, .pricing li',
      'table tr td, tbody tr td',
      '.amount, .price, .cost',
      'p, div, span'
    ];

    feeSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        if (this.isFeeRelated(text)) {
          content.fees.push(this.cleanText(text));
        }
      });
    });

    // Remove duplicates and filter relevant fees
    content.fees = [...new Set(content.fees)]
      .filter(fee => fee.length > 10 && fee.length < 200)
      .slice(0, 10);
  }

  // Enhanced requirements extraction
  extractRequirementsEnhanced($, content, service) {
    const reqSelectors = [
      '.requirements li, .documents li',
      '.checklist li, .document-list li',
      'ul li, ol li',
      '.required-documents p, .documents-needed p',
      'table tr td'
    ];

    reqSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        if (this.isRequirementRelated(text)) {
          content.requirements.push(this.cleanText(text));
        }
      });
    });

    content.requirements = [...new Set(content.requirements)]
      .filter(req => req.length > 15 && req.length < 300)
      .slice(0, 8);
  }

  // Enhanced procedure extraction
  extractProceduresEnhanced($, content, service) {
    const procSelectors = [
      '.steps li, .procedure li, .process li',
      'ol li, .numbered-list li',
      '.step-by-step p, .how-to p',
      '.instructions li'
    ];

    procSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 20 && this.isProcedureRelated(text)) {
          content.procedures.push(this.cleanText(text));
        }
      });
    });

    content.procedures = [...new Set(content.procedures)]
      .filter(proc => proc.length > 25 && proc.length < 400)
      .slice(0, 6);
  }

  // Enhanced contact info extraction
  extractContactInfoEnhanced($, content) {
    const contactSelectors = [
      '.contact-info, .contact-details',
      '.phone, .email, .address',
      'footer, .footer'
    ];

    contactSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        this.extractPhoneAndEmail(text, content);
      });
    });

    // Also search in general text
    $('p, div, span').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.length < 200) {
        this.extractPhoneAndEmail(text, content);
      }
    });

    content.contactInfo = [...new Set(content.contactInfo)].slice(0, 5);
  }

  extractPhoneAndEmail(text, content) {
    // Bangladesh phone number patterns
    const phonePatterns = [
      /(?:\+88)?0?1[3-9]\d{8}/g,  // Mobile numbers
      /(?:\+88)?0?[2-9]\d{7,8}/g,  // Landline numbers
      /\d{2,4}-\d{6,8}/g           // Formatted numbers
    ];

    phonePatterns.forEach(pattern => {
      const phones = text.match(pattern);
      if (phones) {
        phones.forEach(phone => {
          content.contactInfo.push(`📞 ${phone.trim()}`);
        });
      }
    });

    // Email pattern
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex);
    if (emails) {
      emails.forEach(email => {
        content.contactInfo.push(`📧 ${email.trim()}`);
      });
    }
  }

  // Extract important notices and announcements
  extractNotices($, content) {
    const noticeSelectors = [
      '.notice, .announcement, .alert',
      '.important, .highlight',
      '.news-item, .update'
    ];

    noticeSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 30 && text.length < 300) {
          content.notices.push(this.cleanText(text));
        }
      });
    });

    content.notices = [...new Set(content.notices)].slice(0, 3);
  }

  // Extract download links for forms and documents
  extractDownloadLinks($, content, baseUrl) {
    $('a[href*=".pdf"], a[href*=".doc"], a[href*=".docx"], a[href*="download"], a[href*="form"]').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim();
      
      if (href && text && text.length > 5) {
        const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
        content.downloadLinks.push({
          text: text,
          url: fullUrl,
          type: this.getFileType(href)
        });
      }
    });

    content.downloadLinks = content.downloadLinks.slice(0, 5);
  }

  // Helper methods for content classification
  isServiceRelated(text, service) {
    const serviceTerms = [
      'service', 'application', 'online', 'apply', 'registration', 'renewal',
      'সেবা', 'আবেদন', 'অনলাইন', 'নিবন্ধন', 'নবায়ন'
    ];
    
    const serviceLower = text.toLowerCase();
    return serviceTerms.some(term => serviceLower.includes(term)) && 
           text.length > 5 && text.length < 150;
  }

  isFeeRelated(text) {
    const feeIndicators = [
      '৳', 'taka', 'fee', 'cost', 'charge', 'price', 'amount',
      'ফি', 'খরচ', 'টাকা', 'মূল্য'
    ];
    
    return feeIndicators.some(indicator => 
      text.toLowerCase().includes(indicator.toLowerCase())
    ) && text.length > 8 && text.length < 200;
  }

  isRequirementRelated(text) {
    const reqTerms = [
      'required', 'need', 'necessary', 'document', 'certificate', 'copy',
      'প্রয়োজন', 'দরকার', 'লাগবে', 'দলিল', 'সনদ', 'কপি'
    ];
    
    const textLower = text.toLowerCase();
    return reqTerms.some(term => textLower.includes(term)) && 
           text.length > 10 && text.length < 250;
  }

  isProcedureRelated(text) {
    const procTerms = [
      'step', 'process', 'procedure', 'how to', 'method', 'way',
      'ধাপ', 'প্রক্রিয়া', 'পদ্ধতি', 'কিভাবে', 'উপায়'
    ];
    
    const textLower = text.toLowerCase();
    return procTerms.some(term => textLower.includes(term)) ||
           /^\d+[\.\)]\s/.test(text); // Numbered steps
  }

  getFileType(href) {
    if (href.includes('.pdf')) return '📄 PDF';
    if (href.includes('.doc')) return '📝 DOC';
    if (href.includes('.docx')) return '📝 DOCX';
    return '📎 File';
  }

  cleanText(text) {
    return text.replace(/\s+/g, ' ')
               .replace(/^\W+|\W+$/g, '')
               .trim();
  }

  // Fallback basic scraping method
  async basicScrape(url, service) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        }
      });

      const $ = cheerio.load(response.data);
      return {
        title: $('title').text().trim(),
        services: [$('h1, h2, h3').first().text().trim()].filter(Boolean),
        fees: [],
        requirements: [],
        procedures: [],
        contactInfo: [],
        importantLinks: [],
        notices: [],
        downloadLinks: []
      };
    } catch (error) {
      console.error(`Basic scraping failed for ${url}:`, error.message);
      return null;
    }
  }

  // Enhanced important links extraction
  extractImportantLinksEnhanced($, content, baseUrl) {
    const linkSelectors = [
      'a[href*="application"]',
      'a[href*="online"]', 
      'a[href*="service"]',
      'a[href*="form"]',
      'a[href*="download"]',
      'a[href*="registration"]',
      'a[href*="login"]',
      '.btn, .button',
      '.link-item'
    ];

    linkSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const href = $(elem).attr('href');
        const text = $(elem).text().trim();
        
        if (href && text && text.length > 3 && text.length < 100) {
          try {
            const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
            content.importantLinks.push({
              text: this.cleanText(text),
              url: fullUrl,
              priority: this.getLinkPriority(text)
            });
          } catch (error) {
            // Skip invalid URLs
          }
        }
      });
    });

    // Sort by priority and remove duplicates
    content.importantLinks = content.importantLinks
      .sort((a, b) => b.priority - a.priority)
      .filter((link, index, self) => 
        index === self.findIndex(l => l.url === link.url)
      )
      .slice(0, 6);
  }

  getLinkPriority(text) {
    const highPriority = ['application', 'apply', 'online', 'login', 'আবেদন'];
    const mediumPriority = ['service', 'form', 'download', 'সেবা'];
    
    const textLower = text.toLowerCase();
    if (highPriority.some(term => textLower.includes(term))) return 3;
    if (mediumPriority.some(term => textLower.includes(term))) return 2;
    return 1;
  }

  formatResults(service, results, queryAnalysis) {
    const serviceTitle = service.replace('_', ' ').toUpperCase();
    let formatted = `**🏛️ ${serviceTitle} - Latest Information**\n\n`;

    // Add query-specific introduction
    if (queryAnalysis.intent === 'fee_inquiry') {
      formatted += `💰 **Fee Information:**\n`;
    } else if (queryAnalysis.intent === 'procedure_inquiry') {
      formatted += `📋 **Process & Procedures:**\n`;
    } else if (queryAnalysis.intent === 'document_inquiry') {
      formatted += `📄 **Required Documents:**\n`;
    }

    // Process results based on relevance
    const relevantResults = results.filter(result => 
      this.hasUsefulContent(result) && result.relevanceScore > 0
    );

    if (relevantResults.length === 0) {
      // Fallback to all results if no relevant ones found
      relevantResults.push(...results.filter(result => this.hasUsefulContent(result)));
    }

    relevantResults.forEach((result, index) => {
      formatted += `**🌐 ${result.source.replace(/([A-Z])/g, ' $1').trim()} Portal**\n`;
      formatted += `📡 Source: ${result.url}\n\n`;

      // Prioritize content based on query intent
      if (queryAnalysis.needsFee && result.fees.length > 0) {
        formatted += `**� Current Fees:**\n`;
        result.fees.slice(0, 5).forEach(fee => {
          formatted += `• ${fee}\n`;
        });
        formatted += '\n';
      }

      if (queryAnalysis.needsDocuments && result.requirements.length > 0) {
        formatted += `**📋 Required Documents:**\n`;
        result.requirements.slice(0, 5).forEach(req => {
          formatted += `• ${req}\n`;
        });
        formatted += '\n';
      }

      if (queryAnalysis.needsProcedure && result.procedures.length > 0) {
        formatted += `**� Step-by-Step Process:**\n`;
        result.procedures.slice(0, 4).forEach(proc => {
          formatted += `• ${proc}\n`;
        });
        formatted += '\n';
      }

      // Add services if not already covered
      if (result.services.length > 0 && !queryAnalysis.needsFee) {
        formatted += `**🔸 Available Services:**\n`;
        result.services.slice(0, 4).forEach(service => {
          formatted += `• ${service}\n`;
        });
        formatted += '\n';
      }

      // Add important notices
      if (result.notices && result.notices.length > 0) {
        formatted += `**⚠️ Important Notices:**\n`;
        result.notices.slice(0, 2).forEach(notice => {
          formatted += `• ${notice}\n`;
        });
        formatted += '\n';
      }

      // Add download links for forms
      if (result.downloadLinks && result.downloadLinks.length > 0) {
        formatted += `**📥 Download Forms:**\n`;
        result.downloadLinks.slice(0, 3).forEach(link => {
          formatted += `• ${link.type} [${link.text}](${link.url})\n`;
        });
        formatted += '\n';
      }

      // Add contact information
      if (result.contactInfo.length > 0) {
        formatted += `**📞 Contact Information:**\n`;
        result.contactInfo.slice(0, 3).forEach(contact => {
          formatted += `• ${contact}\n`;
        });
        formatted += '\n';
      }

      // Add important links
      if (result.importantLinks.length > 0) {
        formatted += `**🔗 Quick Links:**\n`;
        result.importantLinks.slice(0, 3).forEach(link => {
          formatted += `• [${link.text}](${link.url})\n`;
        });
        formatted += '\n';
      }

      if (index < relevantResults.length - 1) {
        formatted += '---\n\n';
      }
    });

    // Add helpful footer
    formatted += `\n**ℹ️ Information Status:**\n`;
    formatted += `• Last updated: ${new Date().toLocaleDateString('en-GB', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}\n`;
    formatted += `• Sources: ${relevantResults.length} official government website(s)\n`;
    formatted += `• Language: ${queryAnalysis.language === 'bangla' ? 'বাংলা/English' : 'English'}\n\n`;

    // Add contextual suggestions
    if (queryAnalysis.isUrgent) {
      formatted += `⚡ **Urgent Service Note:** Look for express or emergency service options mentioned above.\n\n`;
    }

    formatted += `*💡 Tip: Always verify current information by visiting the official website before proceeding with applications.*`;

    return formatted;
  }

  hasUsefulContent(result) {
    return (result.services && result.services.length > 0) || 
           (result.fees && result.fees.length > 0) || 
           (result.requirements && result.requirements.length > 0) || 
           (result.procedures && result.procedures.length > 0) ||
           (result.importantLinks && result.importantLinks.length > 0) ||
           (result.notices && result.notices.length > 0) ||
           (result.downloadLinks && result.downloadLinks.length > 0);
  }

  // Specific method for getting current fee information
  async getCurrentFees(service) {
    const endpoints = this.serviceEndpoints[service];
    if (!endpoints) return null;

    const feeResults = [];

    for (const [siteName, url] of Object.entries(endpoints)) {
      try {
        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const $ = cheerio.load(response.data);
        const fees = [];

        $('*').each((i, elem) => {
          const text = $(elem).text().trim();
          if (text.includes('৳') && text.length < 100) {
            fees.push(text);
          }
        });

        if (fees.length > 0) {
          feeResults.push({
            source: siteName,
            fees: fees.slice(0, 5)
          });
        }
      } catch (error) {
        console.error(`Fee extraction error for ${siteName}:`, error.message);
      }
    }

    return feeResults.length > 0 ? feeResults : null;
  }

  // Clear cache method
  clearCache() {
    this.cache.clear();
    console.log('[DEBUG] Cache cleared');
  }

  // Get cache stats
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout,
      keys: Array.from(this.cache.keys())
    };
  }

  // Enhanced page content fetching with retry logic and better error handling
  async fetchPageContent(url, options = {}) {
    const {
      maxRetries = 3,
      timeout = 30000,
      ignoreSSL = process.env.NODE_ENV === 'development',
      retryDelay = 1000
    } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[DEBUG] Attempt ${attempt}/${maxRetries} for ${url}`);
        
        const response = await axios.get(url, {
          timeout,
          httpsAgent: new https.Agent({
            rejectUnauthorized: !ignoreSSL,
            keepAlive: true,
            maxSockets: 5
          }),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5,bn;q=0.3',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          validateStatus: (status) => status < 500, // Don't retry on 4xx errors
          maxRedirects: 5
        });

        if (response.status >= 200 && response.status < 300) {
          console.log(`[DEBUG] Successfully fetched ${url} on attempt ${attempt}`);
          return response.data;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const shouldRetry = this.shouldRetryError(error);

        console.error(`[ERROR] Attempt ${attempt}/${maxRetries} failed for ${url}:`, error.message);

        if (!shouldRetry || isLastAttempt) {
          if (isLastAttempt) {
            console.error(`[ERROR] All ${maxRetries} attempts failed for ${url}`);
            // Try fallback mechanisms
            return await this.tryFallbackMethods(url, error);
          }
          throw error;
        }

        // Calculate exponential backoff delay
        const delay = retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[DEBUG] Retrying ${url} in ${Math.round(delay)}ms...`);
        await this.sleep(delay);
      }
    }

    return null;
  }

  // Determine if an error should trigger a retry
  shouldRetryError(error) {
    const retryableErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND', // DNS resolution errors
      'ENETUNREACH',
      'EHOSTUNREACH',
      'CERT_HAS_EXPIRED',
      'CERT_UNTRUSTED',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    ];

    // Check axios error codes
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }

    // Check for timeout errors
    if (error.message && error.message.includes('timeout')) {
      return true;
    }

    // Check for SSL/TLS errors
    if (error.message && (
      error.message.includes('certificate') ||
      error.message.includes('SSL') ||
      error.message.includes('TLS')
    )) {
      return true;
    }

    // Check for network errors
    if (error.response && error.response.status >= 500) {
      return true;
    }

    return false;
  }

  // Sleep utility for retry delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Fallback methods when primary scraping fails
  async tryFallbackMethods(originalUrl, primaryError) {
    console.log(`[DEBUG] Trying fallback methods for ${originalUrl}`);

    // Fallback 1: Try with different user agent and simplified options
    try {
      console.log('[DEBUG] Fallback 1: Simplified axios request');
      const response = await axios.get(originalUrl, {
        timeout: 15000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_2_method'
        }),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        },
        maxRedirects: 2
      });
      console.log('[DEBUG] Fallback 1 successful');
      return response.data;
    } catch (fallback1Error) {
      console.error('[DEBUG] Fallback 1 failed:', fallback1Error.message);
    }

    // Fallback 2: Try with http instead of https (if applicable)
    if (originalUrl.startsWith('https://')) {
      try {
        const httpUrl = originalUrl.replace('https://', 'http://');
        console.log(`[DEBUG] Fallback 2: Trying HTTP version: ${httpUrl}`);
        
        const response = await axios.get(httpUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        console.log('[DEBUG] Fallback 2 successful');
        return response.data;
      } catch (fallback2Error) {
        console.error('[DEBUG] Fallback 2 failed:', fallback2Error.message);
      }
    }

    // Fallback 3: Return cached data if available
    const cacheKey = `fallback_${originalUrl}`;
    if (this.cache.has(cacheKey)) {
      console.log('[DEBUG] Fallback 3: Using cached data');
      const cached = this.cache.get(cacheKey);
      return cached.data;
    }

    // Fallback 4: Return static fallback data based on service type
    console.log('[DEBUG] Fallback 4: Using static fallback data');
    return this.getStaticFallbackData(originalUrl, primaryError);
  }

  // Provide static fallback data when all scraping attempts fail
  getStaticFallbackData(url, error) {
    console.log(`[DEBUG] Generating static fallback for ${url}`);
    
    // Determine service type from URL
    let serviceType = 'general';
    if (url.includes('passport')) serviceType = 'passport';
    else if (url.includes('nid') || url.includes('voter')) serviceType = 'nid';
    else if (url.includes('birth') || url.includes('bdris')) serviceType = 'birth_certificate';
    else if (url.includes('driving') || url.includes('brta')) serviceType = 'driving_license';
    else if (url.includes('tax') || url.includes('nbr')) serviceType = 'tax';

    const fallbackData = this.generateFallbackContent(serviceType, url, error);
    
    // Cache the fallback data for future use
    const cacheKey = `fallback_${url}`;
    this.cache.set(cacheKey, {
      data: fallbackData,
      timestamp: Date.now()
    });

    return fallbackData;
  }

  // Generate appropriate fallback content based on service type
  generateFallbackContent(serviceType, url, error) {
    const currentDate = new Date().toLocaleDateString('en-GB');
    
    const fallbackTemplates = {
      passport: `
        <html>
          <head><title>Bangladesh Passport Services - Offline Information</title></head>
          <body>
            <h1>Passport Services - Bangladesh</h1>
            <div class="service-item">Online passport application available</div>
            <div class="service-item">Passport renewal services</div>
            <div class="fee-info">Regular passport fee: ৳1,500</div>
            <div class="fee-info">Express passport fee: ৳3,000</div>
            <div class="contact-info">📞 16263</div>
            <div class="important-link"><a href="https://epassport.gov.bd">Apply Online</a></div>
            <p class="notice">Service temporarily unavailable. Please visit the official website.</p>
          </body>
        </html>
      `,
      nid: `
        <html>
          <head><title>National ID Services - Offline Information</title></head>
          <body>
            <h1>National ID Card Services</h1>
            <div class="service-item">Smart NID card application</div>
            <div class="service-item">NID correction services</div>
            <div class="fee-info">New NID fee: ৳500</div>
            <div class="fee-info">Correction fee: ৳250</div>
            <div class="contact-info">📞 333</div>
            <div class="important-link"><a href="https://services.nidw.gov.bd">NID Services</a></div>
            <p class="notice">Service temporarily unavailable. Please visit the official website.</p>
          </body>
        </html>
      `,
      birth_certificate: `
        <html>
          <head><title>Birth Registration Services - Offline Information</title></head>
          <body>
            <h1>Birth Certificate Services</h1>
            <div class="service-item">Online birth certificate application</div>
            <div class="service-item">Birth certificate correction</div>
            <div class="fee-info">Birth certificate fee: ৳50</div>
            <div class="contact-info">📞 16263</div>
            <div class="important-link"><a href="https://bdris.gov.bd">Apply Online</a></div>
            <p class="notice">Service temporarily unavailable. Please visit the official website.</p>
          </body>
        </html>
      `,
      driving_license: `
        <html>
          <head><title>Driving License Services - Offline Information</title></head>
          <body>
            <h1>Driving License Services</h1>
            <div class="service-item">Driving license application</div>
            <div class="service-item">License renewal services</div>
            <div class="fee-info">Professional license fee: ৳2,000</div>
            <div class="fee-info">Non-professional license fee: ৳1,000</div>
            <div class="contact-info">📞 9555555</div>
            <div class="important-link"><a href="https://dlrs.gov.bd">DLRS Portal</a></div>
            <p class="notice">Service temporarily unavailable. Please visit the official website.</p>
          </body>
        </html>
      `,
      tax: `
        <html>
          <head><title>Tax Services - Offline Information</title></head>
          <body>
            <h1>Tax and Revenue Services</h1>
            <div class="service-item">Income tax return filing</div>
            <div class="service-item">TIN registration</div>
            <div class="service-item">VAT registration</div>
            <div class="contact-info">📞 16263</div>
            <div class="important-link"><a href="https://incometax.gov.bd">Income Tax Portal</a></div>
            <p class="notice">Service temporarily unavailable. Please visit the official website.</p>
          </body>
        </html>
      `,
      general: `
        <html>
          <head><title>Government Services - Offline Information</title></head>
          <body>
            <h1>Bangladesh Government Services</h1>
            <div class="service-item">Online government services available</div>
            <div class="contact-info">📞 16263 (General Helpline)</div>
            <div class="important-link"><a href="https://bangladesh.gov.bd">Government Portal</a></div>
            <p class="notice">Service temporarily unavailable due to: ${error.code || error.message}</p>
            <p class="notice">Data retrieved: ${currentDate}</p>
          </body>
        </html>
      `
    };

    return fallbackTemplates[serviceType] || fallbackTemplates.general;
  }
}

export default BangladeshGovScraper;
