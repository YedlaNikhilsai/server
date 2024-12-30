// models/Room.js
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Participant' }]
});

module.exports = mongoose.model('Room', roomSchema);

// models/Participant.js
const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  token: { type: String, required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' }
});

module.exports = mongoose.model('Participant', participantSchema);



// utils/100msAPI.js
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env['100MS_API_KEY'];
const BASE_URL = 'https://api.100ms.live/v2/';

const createRoom = async () => {
  try {
    const response = await axios.post(
      `${BASE_URL}rooms`,
      {},
      {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating room:', error);
    throw error;
  }
};

const generateToken = async (roomId, userId) => {
  try {
    const response = await axios.post(
      `${BASE_URL}rooms/${roomId}/tokens`,
      { user_id: userId },
      {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error generating token:', error);
    throw error;
  }
};

module.exports = { createRoom, generateToken };



// websocket.js
const WebSocket = require('ws');
let wss;

const initWebSocket = (server) => {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    ws.on('message', (message) => {
      console.log(`Received message: ${message}`);
    });

    ws.send('Connected to WebSocket Server!');
  });
};

const sendToAllClients = (message) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

module.exports = { initWebSocket, sendToAllClients };



// server.js
const express = require('express');
const mongoose = require('mongoose');
const { createRoom, generateToken } = require('./utils/100msAPI');
const { initWebSocket, sendToAllClients } = require('./websocket');
const Room = require('./models/Room');
const Participant = require('./models/Participant');
const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Route to create a room
app.post('/rooms', async (req, res) => {
  try {
    const room = await createRoom();
    const newRoom = new Room({
      roomId: room.id,
      participants: [],
    });
    await newRoom.save();
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create room', error });
  }
});

// Route to generate token for participants
app.post('/rooms/:roomId/token', async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  try {
    const tokenData = await generateToken(roomId, userId);
    const newParticipant = new Participant({
      userId,
      token: tokenData.token,
      roomId,
    });
    await newParticipant.save();
    res.status(200).json(tokenData);
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate token', error });
  }
});

// Route to list active rooms with participant count
app.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find().populate('participants');
    const roomData = rooms.map(room => ({
      roomId: room.roomId,
      participantsCount: room.participants.length,
    }));
    res.status(200).json(roomData);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list rooms', error });
  }
});

// WebSocket endpoint for participant join/leave events
app.post('/rooms/:roomId/participants', (req, res) => {
  const { roomId } = req.params;
  const { action, userId } = req.body;

  // Send WebSocket message to notify clients about the action
  sendToAllClients(JSON.stringify({
    roomId,
    action,
    userId,
  }));

  res.status(200).json({ message: `Participant ${action} successfully` });
});

// Initialize WebSocket server
initWebSocket(server);

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
