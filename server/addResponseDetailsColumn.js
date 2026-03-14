const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to testing/production database
const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error connecting to database:", err.message);
        process.exit(1);
    }
    console.log("Connected to the SQLite database.");
});

db.serialize(() => {
    // 1. Add response_details column to datacheck
    db.run("ALTER TABLE datacheck ADD COLUMN response_details TEXT", (err) => {
        if (err) {
            if (err.message.includes("duplicate column name")) {
                console.log("Column 'response_details' already exists in datacheck.");
            } else {
                console.error("Error adding column to datacheck:", err.message);
            }
        } else {
            console.log("Successfully added 'response_details' to datacheck.");
        }
    });
});

// Close database connection
db.close((err) => {
    if (err) {
        console.error("Error closing database:", err.message);
    } else {
        console.log("Database connection closed.");
    }
});
