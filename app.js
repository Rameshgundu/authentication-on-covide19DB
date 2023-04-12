const express = require("express");
const app = express();

const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
app.use(express.json());
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB ERROR : ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

//USER LOGIN
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const encryptPassword = await bcrypt.hash(password, 10);
  const loginUserQuery = `
    SELECT * FROM user where username = '${username}';`;
  const userQuery = await db.get(loginUserQuery);
  if (userQuery !== undefined) {
    const comparePassword = await bcrypt.compare(password, userQuery.password);
    if (comparePassword) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "First_Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "First_Token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

/// Get States
app.get("/states/", authentication, async (request, response) => {
  const getStatesQuery = `
      SELECT * FROM state;`;
  const dbResp = await db.all(getStatesQuery);
  function convertCase(state) {
    return {
      stateId: state.state_id,
      stateName: state.state_name,
      population: state.population,
    };
  }
  const stateDetails = dbResp.map(convertCase);

  response.send(stateDetails);
});

/// Get particular state
app.get("/states/:stateId/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const getState = `
      SELECT * FROM state where state_id = '${stateId}';`;
  const dbResp = await db.get(getState);
  const stateInfo = {
    stateId: dbResp.state_id,
    stateName: dbResp.state_name,
    population: dbResp.population,
  };
  response.send(stateInfo);
});

/// Get districts
app.post("/districts/", authentication, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const insertDistrict = `INSERT
                             INTO district(district_name, state_id, cases, cured, active, deaths)
                            VALUES(
                                '${districtName}',
                                ${stateId},
                                ${cases},
                                ${cured},
                                ${active},
                                ${deaths}
                            );`;
  await db.run(insertDistrict);
  response.send("District Successfully Added");
});

//Get particular district
app.get(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrict = `
      SELECT * FROM district where district_id = ${districtId};`;
    const dbResp = await db.get(getDistrict);
    const district = {
      districtId: dbResp.district_id,
      districtName: dbResp.district_name,
      stateId: dbResp.state_id,
      cases: dbResp.cases,
      cured: dbResp.cured,
      active: dbResp.active,
      deaths: dbResp.deaths,
    };
    response.send(district);
  }
);

/// Delete particular state

app.delete(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `DELETE FROM district where district_id = ${districtId};`;
    await db.run(deleteQuery);
    response.send("District Removed");
  }
);

//update district details
app.put(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateQuery = `UPDATE
            district
          SET 
            district_name = '${districtName}',
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths}
          where district_id = ${districtId};`;

    await db.run(updateQuery);
    response.send("District Details Updated");
  }
);

//statistics of a state
app.get(
  "/states/:stateId/stats/",
  authentication,
  async (request, response) => {
    const { stateId } = request.params;
    const statsQuery = `
        SELECT
          sum(cases) as totalCases,
          sum(cured) as totalCured,
          sum(active) as totalActive,
          sum(deaths) as totalDeaths
        FROM
           district
        where 
          state_id = ${stateId}
        group by 
           state_id;`;

    const stats = await db.get(statsQuery);
    response.send(stats);
  }
);

module.exports = app;
