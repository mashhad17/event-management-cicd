// Starts the Event Management API once the database tier is ready.
const os = require('os');
const { app, initDatabase } = require('./app');

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => app.listen(PORT, () => console.log(`Event Management API on port ${PORT} (pod ${os.hostname()})`)))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
