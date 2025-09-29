const express = require('express');
const cors = require('cors');
const http = require('http');
const app = express();

app.use(cors({ origin: 'http://localhost:8081' }));
app.use(express.json());

// Import routes
const categoriesRoutes = require('./routes/categories');
const itemsRoutes = require('./routes/items');
const topicsRoutes = require("./routes/topics");
const lobbiesRoutes = require('./routes/lobbies');
const playersRoutes = require('./routes/players');

app.use('/categories', categoriesRoutes);
app.use('/items', itemsRoutes);
app.use("/topics", topicsRoutes);
app.use('/lobbies', lobbiesRoutes);
app.use('/players', playersRoutes);
app.use('/auth', require('./routes/auth'));

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
});

// Import and init socket logic
const initSocket = require('./socket');
initSocket(io);

// Start server
const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
