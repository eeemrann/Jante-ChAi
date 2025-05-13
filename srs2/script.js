// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize preloader
    const preloader = document.getElementById('preloader');
    setTimeout(() => {
        preloader.style.opacity = '0';
        setTimeout(() => {
            preloader.style.display = 'none';
        }, 500);
    }, 1500);

    // Initialize AOS animation library
    AOS = window.AOS;
    AOS.init({
        duration: 800,
        easing: 'ease-in-out',
        once: true
    });

    // Check for saved language
    const savedLang = localStorage.getItem('language') || 'en';
    setLanguage(savedLang);

    // Check for saved theme
    const savedTheme = localStorage.getItem('darkMode');
    if (savedTheme === 'enabled') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').classList.add('active');
    }

    // Check authentication status
    checkAuthStatus();

    // Navbar scroll effect
    window.addEventListener('scroll', function() {
        const navbar = document.getElementById('mainNav');
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Back to top button
    const backToTopBtn = document.getElementById('backToTop');
    if (backToTopBtn) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('active');
            } else {
                backToTopBtn.classList.remove('active');
            }
        });

        backToTopBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Language switcher
    const languageSwitcher = document.getElementById('languageSwitcher');
    const languageOptions = document.getElementById('languageOptions');
    const currentLang = document.getElementById('currentLang');

    if (languageSwitcher) {
        languageSwitcher.addEventListener('click', function(e) {
            e.stopPropagation();
            languageOptions.classList.toggle('show');
        });

        // Close language options when clicking outside
        document.addEventListener('click', function() {
            languageOptions.classList.remove('show');
        });

        // Language option click
        const options = document.querySelectorAll('.language-option');
        options.forEach(option => {
            option.addEventListener('click', function() {
                const lang = this.getAttribute('data-lang');
                setLanguage(lang);
                languageOptions.classList.remove('show');
            });
        });
    }

    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', function() {
            document.body.classList.toggle('dark-mode');
            this.classList.toggle('active');
            
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('darkMode', 'enabled');
            } else {
                localStorage.setItem('darkMode', 'disabled');
            }
        });
    }

    // Create particles for hero section
    const heroParticles = document.getElementById('heroParticles');
    if (heroParticles) {
        createParticles();
    }

    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutBtnBn = document.getElementById('logoutBtnBn');
    const sidebarLogout = document.getElementById('sidebarLogout');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    if (logoutBtnBn) {
        logoutBtnBn.addEventListener('click', logout);
    }
    
    if (sidebarLogout) {
        sidebarLogout.addEventListener('click', logout);
    }
});

// Function to set language
function setLanguage(lang) {
    document.body.classList.remove('en', 'bn');
    document.body.classList.add(lang);
    
    // Update current language display
    const currentLang = document.getElementById('currentLang');
    if (currentLang) {
        currentLang.textContent = lang.toUpperCase();
    }
    
    // Update active language option
    const options = document.querySelectorAll('.language-option');
    options.forEach(option => {
        if (option.getAttribute('data-lang') === lang) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
    
    // Save language preference
    localStorage.setItem('language', lang);
}

// Function to create particles
function createParticles() {
    const heroParticles = document.getElementById('heroParticles');
    if (!heroParticles) return;
    
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        
        // Random size
        const size = Math.random() * 20 + 5;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        
        // Random position
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        particle.style.left = `${posX}%`;
        particle.style.top = `${posY}%`;
        
        // Random animation duration
        const duration = Math.random() * 20 + 10;
        particle.style.animationDuration = `${duration}s`;
        
        // Random delay
        const delay = Math.random() * 5;
        particle.style.animationDelay = `${delay}s`;
        
        heroParticles.appendChild(particle);
    }
}

// Function to check authentication status
function checkAuthStatus() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const authNavItem = document.getElementById('authNavItem');
    const userDropdown = document.getElementById('userDropdown');
    
    if (currentUser) {
        // User is logged in
        if (authNavItem) authNavItem.style.display = 'none';
        if (userDropdown) {
            userDropdown.style.display = 'block';
            document.getElementById('userName').textContent = currentUser.name;
            document.getElementById('userNameBn').textContent = currentUser.name;
        }
        
        // If on auth page, redirect to dashboard
        if (window.location.pathname.includes('auth.html')) {
            window.location.href = 'dashboard.html';
        }
    } else {
        // User is not logged in
        if (authNavItem) authNavItem.style.display = 'block';
        if (userDropdown) userDropdown.style.display = 'none';
        
        // If on dashboard page, redirect to auth
        if (window.location.pathname.includes('dashboard.html')) {
            window.location.href = 'auth.html';
        }
    }
}

// Function to logout
function logout(e) {
    if (e) e.preventDefault();
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

// Format time for chat messages
function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes} ${ampm}`;
}