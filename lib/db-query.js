const config = require("./config");
const { Client } = require("pg");
const isProduction = (config.NODE_ENV === "production");

const CONNECTION = {
  connectionString: config.DATABASE_URL,
  ssl: isProduction,
};

const logQuery = (statement, params) => {
  let timeStamp = new Date();
  let formattedTimeStamp = timeStamp.toString().substring(4,24);
  console.log(formattedTimeStamp, statement, params);
};

module.exports = {
  async dbQuery(statement, ...params) {
    let client = new Client(CONNECTION);

    await client.connect();
    logQuery(statement, params);
    let result = await client.query(statement, params);
    await client.end();

    return result;
  }
};