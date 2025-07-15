import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import BangladeshGovScraper from './bangladesh-gov-scraper.js';

class GovernmentWebScraper {
  constructor() {
    this.browser = null;
    this.bangladeshScraper = new BangladeshGovScraper();
    this.serviceMapping = {
      'nid': {
        urls: [
          'https://services.nidw.gov.bd/',
          'https://www.ec.gov.bd/'
        ],
        keywords: ['national id', 'nid', 'voter id', 'smart card']
      },
      'passport': {
        urls: [
          'https://www.passport.gov.bd/',
          'https://epassport.gov.bd/'
        ],
        keywords: ['passport', 'travel document', 'epassport']
      },
      'birth_certificate': {
        urls: [
          'https://bdris.gov.bd/',
          'https://services.nidw.gov.bd/'
        ],
        keywords: ['birth certificate', 'birth registration', 'bdris']
      },
      'driving_license': {
        urls: [
          'https://dlrs.gov.bd/',
          'https://brta.gov.bd/'
        ],
        keywords: ['driving license', 'license', 'brta', 'vehicle']
      },
      'tax': {
        urls: [
          'https://nbr.gov.bd/',
          'https://incometax.gov.bd/'
        ],
        keywords: ['tax', 'income tax', 'nbr', 'tin']
      }
    };
  }

  async initBrowser() {
    if (!this.browser) {
      try {
        this.browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--disable-gpu'
          ]
        });
      } catch (error) {
        console.error('Failed to launch browser:', error);
        this.browser = null;
      }
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // Enhanced service identification with context analysis
  identifyService(userMessage) {
    const message = userMessage.toLowerCase();
    const serviceScores = {};
    
    // Initialize scores
    Object.keys(this.serviceMapping).forEach(service => {
      serviceScores[service] = 0;
    });
    
    // Score based on keyword matches
    for (const [service, config] of Object.entries(this.serviceMapping)) {
      config.keywords.forEach(keyword => {
        if (message.includes(keyword.toLowerCase())) {
          serviceScores[service] += keyword.length; // Longer keywords get higher scores
        }
      });
    }
    
    // Additional context scoring
    this.applyContextualScoring(message, serviceScores);
    
    // Find the service with highest score
    const topService = Object.entries(serviceScores)
      .filter(([_, score]) => score > 0)
      .sort(([,a], [,b]) => b - a)[0];
    
    return topService ? topService[0] : null;
  }

  // Apply contextual scoring based on user intent
  applyContextualScoring(message, serviceScores) {
    // Passport-specific contexts
    if (message.includes('travel') || message.includes('abroad') || message.includes('visa')) {
      serviceScores.passport += 5;
    }
    
    // NID-specific contexts
    if (message.includes('voter') || message.includes('election') || message.includes('smart card')) {
      serviceScores.nid += 5;
    }
    
    // Birth certificate contexts
    if (message.includes('birth') || message.includes('newborn') || message.includes('baby')) {
      serviceScores.birth_certificate += 5;
    }
    
    // Driving license contexts
    if (message.includes('drive') || message.includes('vehicle') || message.includes('car') || message.includes('motorcycle')) {
      serviceScores.driving_license += 5;
    }
    
    // Tax contexts
    if (message.includes('income') || message.includes('return') || message.includes('vat') || message.includes('tin')) {
      serviceScores.tax += 5;
    }
  }

  // Scrape static content using axios and cheerio
  async scrapeStaticContent(url) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      // Extract relevant information
      const content = {
        title: $('title').text().trim(),
        headings: [],
        links: [],
        text: []
      };

      // Extract headings
      $('h1, h2, h3, h4').each((i, elem) => {
        const heading = $(elem).text().trim();
        if (heading) content.headings.push(heading);
      });

      // Extract important links
      $('a[href*="service"], a[href*="application"], a[href*="form"], a[href*="fee"]').each((i, elem) => {
        const link = {
          text: $(elem).text().trim(),
          href: $(elem).attr('href')
        };
        if (link.text && link.href) content.links.push(link);
      });

      // Extract paragraphs and list items
      $('p, li').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 20) content.text.push(text);
      });

      return content;
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
      return null;
    }
  }

  // Scrape dynamic content using puppeteer
  async scrapeDynamicContent(url) {
    try {
      const browser = await this.initBrowser();
      if (!browser) return null;

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 15000 
      });

      // Wait for content to load
      await page.waitForTimeout(2000);

      const content = await page.evaluate(() => {
        const result = {
          title: document.title,
          headings: [],
          links: [],
          text: []
        };

        // Extract headings
        document.querySelectorAll('h1, h2, h3, h4').forEach(elem => {
          const heading = elem.textContent.trim();
          if (heading) result.headings.push(heading);
        });

        // Extract service-related links
        document.querySelectorAll('a[href*="service"], a[href*="application"], a[href*="form"], a[href*="fee"]').forEach(elem => {
          const link = {
            text: elem.textContent.trim(),
            href: elem.getAttribute('href')
          };
          if (link.text && link.href) result.links.push(link);
        });

        // Extract paragraphs and list items
        document.querySelectorAll('p, li').forEach(elem => {
          const text = elem.textContent.trim();
          if (text && text.length > 20) result.text.push(text);
        });

        return result;
      });

      await page.close();
      return content;
    } catch (error) {
      console.error(`Error scraping dynamic content from ${url}:`, error.message);
      return null;
    }
  }

  // Enhanced main method to fetch service-specific information
  async fetchServiceInfo(userMessage) {
    const service = this.identifyService(userMessage);
    if (!service) {
      console.log('[DEBUG] No specific service identified, trying general government search');
      return await this.generalGovernmentSearch(userMessage);
    }

    console.log(`[DEBUG] Fetching info for service: ${service}`);

    try {
      // First, try the specialized Bangladesh government scraper
      const bangladeshData = await this.bangladeshScraper.fetchServiceData(service, userMessage);
      if (bangladeshData) {
        console.log('[DEBUG] Successfully fetched data from Bangladesh government scraper');
        return bangladeshData;
      }

      // Fallback to generic scraper if specialized scraper fails
      console.log('[DEBUG] Falling back to generic scraper');
      const serviceConfig = this.serviceMapping[service];
      const results = [];

      // Try to scrape from each URL with improved error handling
      for (const url of serviceConfig.urls) {
        try {
          console.log(`[DEBUG] Scraping: ${url}`);
          
          // Try static scraping first (faster)
          let content = await this.scrapeStaticContent(url);
          
          // If static scraping fails or returns minimal data, try dynamic scraping
          if (!content || (content.headings.length === 0 && content.text.length === 0)) {
            console.log(`[DEBUG] Trying dynamic scraping for: ${url}`);
            content = await this.scrapeDynamicContent(url);
          }

          if (content && this.hasMinimalContent(content)) {
            results.push({
              url,
              relevanceScore: this.calculateContentRelevance(content, userMessage),
              ...content
            });
          }
        } catch (error) {
          console.error(`Error processing ${url}:`, error.message);
        }
      }

      // Sort by relevance and return formatted results
      if (results.length > 0) {
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
        return this.formatServiceInfo(service, results, userMessage);
      }

      // Last resort: try a general search
      return await this.generalGovernmentSearch(userMessage);
      
    } catch (error) {
      console.error('Error in fetchServiceInfo:', error);
      return null;
    }
  }

  // Check if content has minimal useful information
  hasMinimalContent(content) {
    return (content.headings && content.headings.length > 0) ||
           (content.text && content.text.length > 0) ||
           (content.links && content.links.length > 0);
  }

  // Calculate relevance score for content
  calculateContentRelevance(content, userMessage) {
    let score = 0;
    const messageLower = userMessage.toLowerCase();
    const keywords = messageLower.split(' ').filter(word => word.length > 3);

    // Score based on keyword presence in content
    keywords.forEach(keyword => {
      const keywordRegex = new RegExp(keyword, 'gi');
      
      // Check headings (higher weight)
      content.headings.forEach(heading => {
        const matches = (heading.match(keywordRegex) || []).length;
        score += matches * 3;
      });
      
      // Check text content
      content.text.forEach(text => {
        const matches = (text.match(keywordRegex) || []).length;
        score += matches * 1;
      });
      
      // Check links
      content.links.forEach(link => {
        const matches = (link.text.match(keywordRegex) || []).length;
        score += matches * 2;
      });
    });

    return score;
  }

  // General government service search when specific service isn't identified
  async generalGovernmentSearch(userMessage) {
    console.log('[DEBUG] Attempting general government search');
    
    const generalUrls = [
      'https://bangladesh.gov.bd/',
      'https://services.gov.bd/',
      'https://a2i.gov.bd/'
    ];

    const results = [];
    
    for (const url of generalUrls) {
      try {
        const content = await this.scrapeStaticContent(url);
        if (content && this.hasMinimalContent(content)) {
          results.push({
            url,
            relevanceScore: this.calculateContentRelevance(content, userMessage),
            ...content
          });
        }
      } catch (error) {
        console.error(`Error in general search for ${url}:`, error.message);
      }
    }

    if (results.length > 0) {
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      return this.formatGeneralResults(results, userMessage);
    }

    return null;
  }

  // Format general search results
  formatGeneralResults(results, userMessage) {
    let formatted = `**🏛️ Government Services Information**\n\n`;
    formatted += `Based on your query about "${userMessage}", here's what I found:\n\n`;

    results.slice(0, 2).forEach((result, index) => {
      formatted += `**Source ${index + 1}: ${result.url}**\n`;
      
      if (result.headings.length > 0) {
        formatted += `**Relevant Services:**\n`;
        result.headings.slice(0, 4).forEach(heading => {
          formatted += `• ${heading}\n`;
        });
        formatted += '\n';
      }

      if (result.links.length > 0) {
        formatted += `**Useful Links:**\n`;
        result.links.slice(0, 3).forEach(link => {
          formatted += `• [${link.text}](${link.href})\n`;
        });
        formatted += '\n';
      }
    });

    formatted += `*For more specific information, please mention the exact service you need (e.g., passport, NID, birth certificate, etc.)*`;
    
    return formatted;
  }

  // Enhanced formatting with user message context
  formatServiceInfo(service, results, userMessage) {
    const serviceTitle = service.replace('_', ' ').toUpperCase();
    let formattedInfo = `**🏛️ ${serviceTitle} Services - Real-time Information**\n\n`;

    // Add context-aware introduction
    const messageLower = userMessage.toLowerCase();
    if (messageLower.includes('fee') || messageLower.includes('cost')) {
      formattedInfo += `💰 **Fee Information for ${serviceTitle}:**\n\n`;
    } else if (messageLower.includes('how') || messageLower.includes('process')) {
      formattedInfo += `📋 **Step-by-step Process for ${serviceTitle}:**\n\n`;
    } else if (messageLower.includes('document') || messageLower.includes('require')) {
      formattedInfo += `📄 **Required Documents for ${serviceTitle}:**\n\n`;
    }

    results.forEach((result, index) => {
      if (result.headings.length > 0 || result.text.length > 0) {
        formattedInfo += `**🌐 Source ${index + 1}: Official Website**\n`;
        formattedInfo += `📡 ${result.url}\n`;
        formattedInfo += `⭐ Relevance Score: ${result.relevanceScore || 0}\n\n`;
        
        // Prioritize content based on user query
        if (messageLower.includes('fee') && this.hasFeeInfo(result)) {
          formattedInfo += this.extractFeeInformation(result);
        }
        
        // Add relevant headings
        if (result.headings.length > 0) {
          formattedInfo += `**🔸 Available Services:**\n`;
          result.headings.slice(0, 5).forEach(heading => {
            formattedInfo += `• ${heading}\n`;
          });
          formattedInfo += '\n';
        }

        // Add relevant text content (filtered for usefulness)
        if (result.text.length > 0) {
          const relevantText = this.filterRelevantText(result.text, userMessage);
          if (relevantText.length > 0) {
            formattedInfo += `**ℹ️ Key Information:**\n`;
            relevantText.slice(0, 4).forEach(text => {
              formattedInfo += `• ${text}\n`;
            });
            formattedInfo += '\n';
          }
        }

        // Add relevant links
        if (result.links.length > 0) {
          formattedInfo += `**🔗 Important Links:**\n`;
          result.links.slice(0, 4).forEach(link => {
            formattedInfo += `• [${link.text}](${link.href})\n`;
          });
          formattedInfo += '\n';
        }

        if (index < results.length - 1) {
          formattedInfo += '---\n\n';
        }
      }
    });

    // Add helpful footer with timestamp and suggestions
    formattedInfo += `\n**📅 Information Status:**\n`;
    formattedInfo += `• Retrieved: ${new Date().toLocaleString('en-GB', {
      weekday: 'short',
      year: 'numeric', 
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}\n`;
    formattedInfo += `• Sources: ${results.length} official government website(s)\n`;
    formattedInfo += `• Status: ✅ Real-time data\n\n`;
    
    // Add contextual suggestions
    formattedInfo += `**💡 Next Steps:**\n`;
    if (messageLower.includes('fee')) {
      formattedInfo += `• Visit the official website to confirm current fees\n`;
      formattedInfo += `• Check for any recent fee updates or notifications\n`;
    } else if (messageLower.includes('apply') || messageLower.includes('application')) {
      formattedInfo += `• Gather all required documents before applying\n`;
      formattedInfo += `• Check if online application is available\n`;
    } else {
      formattedInfo += `• Visit the official website for the most current information\n`;
      formattedInfo += `• Contact the relevant office if you need clarification\n`;
    }

    return formattedInfo;
  }

  // Check if result contains fee information
  hasFeeInfo(result) {
    const feeKeywords = ['৳', 'taka', 'fee', 'cost', 'charge', 'price'];
    return [...result.headings, ...result.text, ...result.links.map(l => l.text)]
      .some(text => feeKeywords.some(keyword => text.toLowerCase().includes(keyword)));
  }

  // Extract fee-specific information
  extractFeeInformation(result) {
    let feeInfo = `**💰 Fee Structure:**\n`;
    
    // Look for fee information in text
    const feeTexts = result.text.filter(text => {
      const lower = text.toLowerCase();
      return (lower.includes('৳') || lower.includes('fee') || lower.includes('cost')) && 
             text.length < 150;
    });

    if (feeTexts.length > 0) {
      feeTexts.slice(0, 3).forEach(fee => {
        feeInfo += `• ${fee}\n`;
      });
      feeInfo += '\n';
    }

    return feeInfo;
  }

  // Filter text content for relevance to user query
  filterRelevantText(texts, userMessage) {
    const queryWords = userMessage.toLowerCase()
      .split(' ')
      .filter(word => word.length > 3);
    
    return texts.filter(text => {
      if (text.length < 30 || text.length > 200) return false;
      
      // Check if text contains query-relevant words
      const textLower = text.toLowerCase();
      return queryWords.some(word => textLower.includes(word)) ||
             textLower.includes('service') ||
             textLower.includes('application') ||
             textLower.includes('required') ||
             textLower.includes('process');
    }).slice(0, 5);
  }

  // Get specific fee information
  async getFeeInfo(service) {
    const feeUrls = {
      'passport': 'https://www.passport.gov.bd/pages/fee-structure',
      'nid': 'https://services.nidw.gov.bd/fee-structure',
      'driving_license': 'https://dlrs.gov.bd/fee-structure'
    };

    const url = feeUrls[service];
    if (!url) return null;

    try {
      const content = await this.scrapeStaticContent(url);
      if (content) {
        return this.extractFeeInfo(content);
      }
    } catch (error) {
      console.error(`Error fetching fee info for ${service}:`, error);
    }

    return null;
  }

  extractFeeInfo(content) {
    const feeInfo = [];
    
    // Look for fee-related text
    content.text.forEach(text => {
      if (text.toLowerCase().includes('fee') || 
          text.toLowerCase().includes('cost') || 
          text.toLowerCase().includes('taka') ||
          text.toLowerCase().includes('৳')) {
        feeInfo.push(text);
      }
    });

    return feeInfo.length > 0 ? feeInfo.join('\n') : null;
  }

  // Clean up resources
  async cleanup() {
    await this.closeBrowser();
  }
}

export default GovernmentWebScraper;
