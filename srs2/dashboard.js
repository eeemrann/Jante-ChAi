document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }

    // Set user information
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userNameBn').textContent = currentUser.name;
    document.getElementById('sidebarUserName').textContent = currentUser.name;
    document.getElementById('sidebarUserNameBn').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('dashboardUserName').textContent = currentUser.name;
    document.getElementById('dashboardUserNameBn').textContent = currentUser.name;

    // Set initial message time
    document.getElementById('initialMessageTime').textContent = formatTime(new Date());

    // Mobile sidebar toggle
    const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');

    mobileSidebarToggle.addEventListener('click', toggleSidebar);
    mobileOverlay.addEventListener('click', toggleSidebar);

    function toggleSidebar() {
        sidebar.classList.toggle('show');
        mobileOverlay.classList.toggle('show');
    }

    // Tab switching
    const menuItems = document.querySelectorAll('.menu-item');
    const tabContents = document.querySelectorAll('.tab-content');

    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            // Remove active class from all menu items and tabs
            menuItems.forEach(item => item.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));
            
            // Add active class to clicked menu item and corresponding tab
            this.classList.add('active');
            document.getElementById(`${tabId}Tab`).classList.add('active');
            
            // Close sidebar on mobile
            if (window.innerWidth < 992) {
                sidebar.classList.remove('show');
                mobileOverlay.classList.remove('show');
            }
        });
    });

    // Chat functionality
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    const voiceBtn = document.getElementById('voiceBtn');

    // Sample responses for different categories
    const responses = {
        nid: [
            "To apply for a National ID card, you need to visit your nearest Election Commission office with your birth certificate, proof of address, and passport-sized photographs.",
            "You can check your National ID card status online at https://services.nidw.gov.bd/",
            "If you've lost your National ID card, you need to file a General Diary (GD) at your local police station and then apply for a duplicate at the Election Commission office."
        ],
        passport: [
            "To renew your passport, you need to fill out the renewal form online at www.passport.gov.bd and book an appointment.",
            "Passport processing typically takes 15-21 working days for regular service and 7-10 working days for express service.",
            "You need your National ID card, birth certificate, and old passport for renewal."
        ],
        birth: [
            "Birth certificates can be applied for online at www.bdris.gov.bd or at your local city corporation/union council office.",
            "To correct information on your birth certificate, you need to apply with supporting documents at the issuing office.",
            "Birth certificates are essential for school admission, passport application, and National ID registration."
        ],
        driving: [
            "To get a driving license, you need to apply at your local BRTA (Bangladesh Road Transport Authority) office with your National ID, medical certificate, and training certificate.",
            "Driving license renewal should be done before the expiration date. Visit the BRTA office with your old license, National ID, and renewal fee.",
            "If you've lost your driving license, file a GD at the police station and then apply for a duplicate at the BRTA office."
        ],
        tax: [
            "You can register for e-TIN (Taxpayer's Identification Number) online at the National Board of Revenue website: www.nbr.gov.bd",
            "Tax returns must be submitted annually between July 1 and November 30.",
            "Vehicle tax tokens can be renewed online through the BRTA website or at authorized banks."
        ],
        general: [
            "I'm here to help with any government service inquiries. What specific information are you looking for?",
            "For general information about government services, you can visit the official portal at www.bangladesh.gov.bd",
            "Is there a specific department or service you're interested in learning more about?"
        ]
    };

    // Send message on button click
    sendBtn.addEventListener('click', sendMessage);

    // Send message on Enter key
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Voice button click
    voiceBtn.addEventListener('click', handleVoiceRecording);

    // Service category click
    const serviceCategories = document.querySelectorAll('.service-category');
    serviceCategories.forEach(category => {
        category.addEventListener('click', function() {
            const service = this.getAttribute('data-service');
            handleServiceCategoryClick(service);
        });
    });

    // Function to send message
    function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;

        // Add user message to chat
        addMessage(message, true);
        messageInput.value = '';

        // Determine category based on message content
        let category = 'general';
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes('nid') || lowerMessage.includes('national id') || 
            lowerMessage.includes('পরিচয়পত্র') || lowerMessage.includes('এনআইডি')) {
            category = 'nid';
        } else if (lowerMessage.includes('passport') || lowerMessage.includes('পাসপোর্ট')) {
            category = 'passport';
        } else if (lowerMessage.includes('birth') || lowerMessage.includes('জন্ম')) {
            category = 'birth';
        } else if (lowerMessage.includes('driving') || lowerMessage.includes('license') || 
                  lowerMessage.includes('ড্রাইভিং') || lowerMessage.includes('লাইসেন্স')) {
            category = 'driving';
        } else if (lowerMessage.includes('tax') || lowerMessage.includes('কর') || 
                  lowerMessage.includes('ট্যাক্স')) {
            category = 'tax';
        }

        // Show typing indicator
        typingIndicator.classList.add('active');

        // Random response time between 1-3 seconds
        const responseTime = Math.floor(Math.random() * 2000) + 1000;

        setTimeout(() => {
            // Hide typing indicator
            typingIndicator.classList.remove('active');

            // Get random response for the category
            const categoryResponses = responses[category] || responses.general;
            const randomResponse = categoryResponses[Math.floor(Math.random() * categoryResponses.length)];

            // Add bot response
            addMessage(randomResponse, false);
        }, responseTime);
    }

    // Function to add message to chat
    function addMessage(text, isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

        const avatarDiv = document.createElement('div');
        avatarDiv.className = `message-avatar ${isUser ? 'user-avatar-chat' : 'bot-avatar'}`;
        avatarDiv.innerHTML = `<i class="fas fa-${isUser ? 'user' : 'robot'}"></i>`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const textP = document.createElement('p');
        textP.className = 'message-text';
        textP.textContent = text;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = formatTime(new Date());

        contentDiv.appendChild(textP);
        contentDiv.appendChild(timeDiv);
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);

        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Function to handle voice recording
    function handleVoiceRecording() {
        // Toggle recording state
        voiceBtn.classList.toggle('recording');
        const isRecording = voiceBtn.classList.contains('recording');
        
        if (isRecording) {
            // Change icon to stop
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
            
            // Simulate recording for 3 seconds
            setTimeout(() => {
                // Stop recording
                voiceBtn.classList.remove('recording');
                voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                
                // Simulate voice recognition result
                const voiceQueries = [
                    "How to apply for a passport?",
                    "What documents are needed for National ID?",
                    "When is the tax return deadline?",
                    "How to renew driving license?"
                ];
                
                const randomQuery = voiceQueries[Math.floor(Math.random() * voiceQueries.length)];
                messageInput.value = randomQuery;
                messageInput.focus();
            }, 3000);
        } else {
            // Change icon back to microphone
            voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    }

    // Function to handle service category click
    function handleServiceCategoryClick(service) {
        // Predefined queries for each service
        const queries = {
            nid: "Tell me about National ID card services",
            passport: "What are the passport services available?",
            birth: "How can I get a birth certificate?",
            driving: "Tell me about driving license services",
            tax: "What tax services are available?"
        };
        
        // Set the query in the input field
        const query = queries[service];
        
        // Add user message to chat
        addMessage(query, true);
        
        // Show typing indicator
        typingIndicator.classList.add('active');
        
        // Random response time between 1-3 seconds
        const responseTime = Math.floor(Math.random() * 2000) + 1000;
        
        setTimeout(() => {
            // Hide typing indicator
            typingIndicator.classList.remove('active');
            
            // Get random response for the category
            const categoryResponses = responses[service] || responses.general;
            const randomResponse = categoryResponses[Math.floor(Math.random() * categoryResponses.length)];
            
            // Add bot response
            addMessage(randomResponse, false);
        }, responseTime);
    }

    // Function to format time
    function formatTime(date) {
        let hours = date.getHours();
        let minutes = date.getMinutes();
        let ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        minutes = minutes < 10 ? '0'+minutes : minutes;
        return hours + ':' + minutes + ' ' + ampm;
    }
});