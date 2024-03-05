const express = require('express');
const cors = require('cors');
const http = require('http');
const { v4: uuidV4 } = require('uuid');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // Create Socket.IO server instance
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/join', (req, res) => {
    res.send({ link: uuidV4() });
});

io.on('connection', socket => {
    console.log('Socket established');

    socket.on('join-room', (userData) => {
        const { roomID, userID } = userData;
        
        socket.join(roomID);
        socket.to(roomID).broadcast.emit('new-user-connect', userData);

        socket.on('disconnect', () => {
            socket.to(roomID).broadcast.emit('user-disconnected', userID);
        });
    });
});

server.listen(port, () => {
    console.log(`Listening on port ${port}`);
}).on('error', e => {
    console.error(e);
});
