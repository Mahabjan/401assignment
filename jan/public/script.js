import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";

// Firebase Configuration (Replace with your actual config)
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // Function to get the ID token
    const getIdToken = async () => {
        try {
            const user = auth.currentUser;
            if (user) {
                return await user.getIdToken();
            }
            return null;
        } catch (error) {
            console.error('Error getting ID token:', error);
            return null;
        }
    };

    // Function to fetch bot data with authorization
    const fetchBotData = async (url, options = {}) => {
        const token = await getIdToken();
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        const config = {
            ...options,
            headers: headers
        };
        const response = await fetch(url, config);
        return response.json();
    };

    // Check authentication state on the bot interaction page
    if (window.location.pathname === '/bot') {
        getIdToken().then(token => {
            if (!token) {
                window.location.href = '/login';
            } else {
                console.log('User is logged in (client-side)');
                
                const searchMovieBtn = document.getElementById('searchMovieBtn');
                const movieInput = document.getElementById('movieInput');
                const movieDataDiv = document.getElementById('movieData');
                if (searchMovieBtn) {
                    searchMovieBtn.addEventListener('click', async () => {
                        const movie = movieInput.value;
                        if (movie) {
                            const data = await fetchBotData(`/search-movie/${movie}`);
                            movieDataDiv.textContent = JSON.stringify(data, null, 2);
                        } else {
                            movieDataDiv.textContent = 'Please enter a movie name.';
                        }
                    });
                }

                // Logout functionality
                const logoutButton = document.getElementById('logoutBtn');
                if (logoutButton) {
                    logoutButton.addEventListener('click', async () => {
                        try {
                            await signOut(auth);
                            console.log('User logged out');
                            window.location.href = '/login';
                        } catch (error) {
                            console.error('Error logging out:', error);
                        }
                    });
                }
            }
        });
    }

    // Signup Form Handling (if on signup.html)
    const registerForm = document.getElementById('registerForm');
    const registerMessageDiv = document.getElementById('registerMessage');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const telegramUsername = registerForm.telegramUsername.value;
            const telegramID = registerForm.telegramID.value;

            try {
                const response = await fetch('/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramUsername, telegramID })
                });
                const data = await response.json();
                if (response.ok) {
                    registerMessageDiv.textContent = data.message;
                    registerMessageDiv.style.color = 'green';
                    registerForm.reset();
                    window.location.href = '/login';
                } else {
                    registerMessageDiv.textContent = data.error;
                    registerMessageDiv.style.color = 'red';
                }
            } catch (error) {
                console.error('Error registering:', error);
                registerMessageDiv.textContent = 'An error occurred during registration.';
                registerMessageDiv.style.color = 'red';
            }
        });
    }

    // Login Form Handling (if on login.html)
    const loginForm = document.getElementById('loginForm');
    const loginMessageDiv = document.getElementById('loginMessage');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const telegramUsername = loginForm.telegramUsername.value;
            const telegramID = loginForm.telegramID.value;

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramUsername, telegramID })
                });
                const data = await response.json();
                if (response.ok) {
                    loginMessageDiv.textContent = data.message;
                    loginMessageDiv.style.color = 'green';
                    loginForm.reset();
                    // Store the token and redirect
                    localStorage.setItem('authToken', data.token);
                    window.location.href = '/bot';
                } else {
                    loginMessageDiv.textContent = data.error;
                    loginMessageDiv.style.color = 'red';
                }
            } catch (error) {
                console.error('Error logging in:', error);
                loginMessageDiv.textContent = 'An error occurred during login.';
                loginMessageDiv.style.color = 'red';
            }
        });
    }
});