const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, set, push } = require('firebase/database');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const axios = require('axios');
const path = require('path');

dotenv.config();

// Initialize Firebase
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase Admin SDK (for token verification)
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
});

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

// Express app setup
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Register user with email/password
app.post('/register', async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed. Use POST for registration.' });
    }
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        set(ref(db, 'users/' + user.uid), {
            email: user.email,
            createdAt: new Date().toISOString()
        });
        res.status(201).json({ message: 'User registered successfully', user: { uid: user.uid, email: user.email } });
    } catch (error) {
        console.error('Error registering user:', error);
        let errorMessage = 'Registration failed';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email address is already in use.';
        }
        res.status(400).json({ error: errorMessage });
    }
});

// Register Telegram user
app.post('/register-telegram', async (req, res) => {
    const { telegramUsername, telegramID } = req.body;
    if (!telegramUsername || !telegramID) {
        return res.status(400).json({ error: 'Telegram username and ID are required.' });
    }
    
    try {
        // Create a new entry in the database for Telegram users
        const telegramUserRef = ref(db, 'telegramUsers');
        const newUserRef = push(telegramUserRef);
        
        await set(newUserRef, {
            username: telegramUsername,
            telegramId: telegramID,
            createdAt: new Date().toISOString()
        });
        
        res.status(201).json({ message: 'Telegram user registered successfully' });
    } catch (error) {
        console.error('Error registering Telegram user:', error);
        res.status(400).json({ error: 'Failed to register Telegram user' });
    }
});

// Login user
app.post('/login', async (req, res) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1]; // Extract token
    if (!idToken) {
        return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken); // Verify token
        const user = await admin.auth().getUser(decodedToken.uid);

        res.json({
            message: "Logged in successfully",
            user: {
                uid: user.uid,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Error verifying token:", error);
        res.status(401).json({ error: "Invalid authentication token." });
    }
});

// Telegram user login
app.post('/login-telegram', async (req, res) => {
    const { telegramUsername, telegramID } = req.body;
    if (!telegramUsername || !telegramID) {
        return res.status(400).json({ error: 'Telegram username and ID are required.' });
    }
    
    try {
        // Create a custom token for Telegram users
        const customToken = await admin.auth().createCustomToken(`telegram:${telegramID}`);
        
        res.json({
            message: "Logged in successfully",
            token: customToken
        });
    } catch (error) {
        console.error("Error creating token for Telegram user:", error);
        res.status(401).json({ error: "Authentication failed." });
    }
});

// Bike search functionality 
app.get('/search-bike/:query', async (req, res) => {
    // Verify authentication
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
        return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    try {
        // Verify token
        await admin.auth().verifyIdToken(idToken);
        
        const query = req.params.query;
        const apiKey = process.env.BIKE_API_KEY; // Replace with your actual bike API key
        const apiUrl = `https://bikeindex.org/api/v3/search?page=1&per_page=10&query=${encodeURIComponent(query)}&stolenness=all`;

        try {
            const response = await axios.get(apiUrl);
            const bikes = response.data.bikes;
            
            if (!bikes || bikes.length === 0) {
                res.status(404).json({ error: 'No bikes found' });
            } else {
                // Format bike data
                const formattedBikes = bikes.map(bike => ({
                    id: bike.id,
                    title: bike.title,
                    manufacturer: bike.manufacturer_name,
                    year: bike.year,
                    frame_model: bike.frame_model,
                    frame_colors: bike.frame_colors,
                    stolen: bike.stolen,
                    thumb: bike.thumb,
                    url: bike.url
                }));
                
                // Store search history
                const userId = (await admin.auth().verifyIdToken(idToken)).uid;
                const searchRef = ref(db, `searchHistory/${userId}`);
                const newSearchRef = push(searchRef);
                
                await set(newSearchRef, {
                    query: query,
                    timestamp: new Date().toISOString(),
                    resultsCount: formattedBikes.length
                });
                
                res.json(formattedBikes);
            }
        } catch (error) {
            console.error('Error fetching bike details:', error);
            res.status(500).json({ error: 'Failed to fetch bike details' });
        }
    } catch (error) {
        console.error("Error verifying token:", error);
        res.status(401).json({ error: "Invalid authentication token." });
    }
});

// Get user search history
app.get('/search-history', async (req, res) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
        return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;
        
        // Get search history from database
        const historyRef = ref(db, `searchHistory/${userId}`);
        const historySnapshot = await get(historyRef);
        
        if (historySnapshot.exists()) {
            res.json(historySnapshot.val());
        } else {
            res.json({});
        }
    } catch (error) {
        console.error("Error fetching search history:", error);
        res.status(500).json({ error: "Failed to fetch search history." });
    }
});

// Serve HTML pages
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/bot', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bot.html'));
});

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Listen to requests on the specified port
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});