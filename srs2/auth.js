document.addEventListener('DOMContentLoaded', function() {
    // Tab switching
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToRegisterBn = document.getElementById('switchToRegisterBn');
    const switchToLogin = document.getElementById('switchToLogin');
    const switchToLoginBn = document.getElementById('switchToLoginBn');

    // Check if we should show register tab based on URL hash
    if (window.location.hash === '#register') {
        showRegisterTab();
    }

    // Tab click handlers
    loginTab.addEventListener('click', showLoginTab);
    registerTab.addEventListener('click', showRegisterTab);
    
    // Switch link handlers
    if (switchToRegister) switchToRegister.addEventListener('click', function(e) {
        e.preventDefault();
        showRegisterTab();
    });
    
    if (switchToRegisterBn) switchToRegisterBn.addEventListener('click', function(e) {
        e.preventDefault();
        showRegisterTab();
    });
    
    if (switchToLogin) switchToLogin.addEventListener('click', function(e) {
        e.preventDefault();
        showLoginTab();
    });
    
    if (switchToLoginBn) switchToLoginBn.addEventListener('click', function(e) {
        e.preventDefault();
        showLoginTab();
    });

    // Form submission handlers
    const loginFormElement = document.getElementById('loginFormElement');
    const registerFormElement = document.getElementById('registerFormElement');

    if (loginFormElement) {
        loginFormElement.addEventListener('submit', handleLoginSubmit);
    }

    if (registerFormElement) {
        registerFormElement.addEventListener('submit', handleRegisterSubmit);
    }

    // Function to show login tab
    function showLoginTab() {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        clearErrors();
    }

    // Function to show register tab
    function showRegisterTab() {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
        clearErrors();
    }

    // Function to clear all error messages
    function clearErrors() {
        const errorElements = document.querySelectorAll('.invalid-feedback');
        errorElements.forEach(element => {
            element.textContent = '';
        });

        const invalidInputs = document.querySelectorAll('.is-invalid');
        invalidInputs.forEach(input => {
            input.classList.remove('is-invalid');
        });

        document.getElementById('loginError').style.display = 'none';
    }

    // Function to handle login form submission
    function handleLoginSubmit(e) {
        e.preventDefault();
        clearErrors();

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        let isValid = true;

        // Validate email
        if (!email.trim()) {
            showError('loginEmail', 'Email or mobile number is required');
            isValid = false;
        }

        // Validate password
        if (!password.trim()) {
            showError('loginPassword', 'Password is required');
            isValid = false;
        }

        if (isValid) {
            // Get users from localStorage
            const users = JSON.parse(localStorage.getItem('users')) || [];
            const user = users.find(u => u.email === email && u.password === password);

            if (user) {
                // Login successful
                localStorage.setItem('currentUser', JSON.stringify(user));
                window.location.href = 'dashboard.html';
            } else {
                // Login failed
                document.getElementById('loginError').textContent = 'Invalid email or password';
                document.getElementById('loginError').style.display = 'block';
            }
        }
    }

    // Function to handle register form submission
    function handleRegisterSubmit(e) {
        e.preventDefault();
        clearErrors();

        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const mobile = document.getElementById('registerMobile').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        const agreeTerms = document.getElementById('agreeTerms').checked;
        let isValid = true;

        // Validate name
        if (!name.trim()) {
            showError('registerName', 'Full name is required');
            isValid = false;
        }

        // Validate email
        if (!email.trim()) {
            showError('registerEmail', 'Email is required');
            isValid = false;
        } else if (!/\S+@\S+\.\S+/.test(email)) {
            showError('registerEmail', 'Email is invalid');
            isValid = false;
        }

        // Validate mobile
        if (!mobile.trim()) {
            showError('registerMobile', 'Mobile number is required');
            isValid = false;
        }

        // Validate password
        if (!password.trim()) {
            showError('registerPassword', 'Password is required');
            isValid = false;
        } else if (password.length < 6) {
            showError('registerPassword', 'Password must be at least 6 characters');
            isValid = false;
        }

        // Validate confirm password
        if (password !== confirmPassword) {
            showError('registerConfirmPassword', 'Passwords do not match');
            isValid = false;
        }

        // Validate terms agreement
        if (!agreeTerms) {
            showError('agreeTerms', 'You must agree to the Terms & Conditions');
            isValid = false;
        }

        if (isValid) {
            // Get existing users or create empty array
            const users = JSON.parse(localStorage.getItem('users')) || [];
            
            // Check if email already exists
            const existingUser = users.find(u => u.email === email);
            if (existingUser) {
                showError('registerEmail', 'Email already exists');
                return;
            }

            // Create new user
            const newUser = {
                name,
                email,
                mobile,
                password
            };

            // Add to users array
            users.push(newUser);
            
            // Save to localStorage
            localStorage.setItem('users', JSON.stringify(users));
            
            // Show success message and switch to login
            alert('Registration successful! Please login with your credentials.');
            
            // Pre-fill login form with registered email
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').value = '';
            
            // Switch to login tab
            showLoginTab();
        }
    }

    // Function to show error message
    function showError(inputId, message) {
        const input = document.getElementById(inputId);
        const errorElement = document.getElementById(`${inputId}Error`);
        
        if (input && errorElement) {
            input.classList.add('is-invalid');
            errorElement.textContent = message;
        }
    }
});