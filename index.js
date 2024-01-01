import pg from "pg"; //postgress database
import cors from "cors";
import { md5 } from "js-md5"

//Connecting Database
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "swiftrent",
  password: "12345678",
  port: "5432",
});
db.connect();

import express from "express"; //express server
import bodyParser from "body-parser";
import morgan from "morgan"; //request logging tool

//finding out directory folder
import { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(__dirname);

//Initiating Express Server
const app = express();
app.use(cors());
const port = 3000;

//JSON Parser
app.use(express.json());

//Parser
app.use(bodyParser.urlencoded({ extended: true }));
//Request Logger
app.use(morgan("tiny"));

//API 0: Admin Login
app.post("/api/admin/login", async (req, res) => {
  //Inputs
  const { userName, password } = req.body;
    if (userName == "admin" && password == "admin") {
      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ error: "Incorrect Credentials" });
    }    
});

// API 1: Login
app.post("/api/login", async (req, res) => {
  //Inputs
  const { emailOrPhone, password } = req.body;
  try {
    // Check if the email or number exists in the User table
    const userQuery = await db.query(
      "SELECT * FROM UserInformation WHERE email = $1 OR phone = $1",
      [emailOrPhone]
    );
    if (userQuery.rows.length === 0) {
      // User not found
      return res.status(401).json({ error: "Incorrect Credentials" });
    }

    const user = userQuery.rows[0];

    // Check if the provided password matches the stored password
    if (user.md5password !== password) {
      return res.status(401).json({ error: "Incorrect Credentials" });
    }

    // Determine the user type (Owner, Tenant, etc.) by checking other tables
    const ownerQuery = await db.query("SELECT * FROM Owner WHERE userID = $1", [
      user.id,
    ]);
    const tenantQuery = await db.query(
      "SELECT * FROM Tenant WHERE userID = $1",
      [user.id]
    );

    let ownerID = 0,
      tenantID = 0;
    let userID = user.id;

    if (ownerQuery.rows.length > 0) {
      ownerID = ownerQuery.rows[0].id;
    }
    if (tenantQuery.rows.length > 0) {
      tenantID = tenantQuery.rows[0].id;
    }

    // Return the user ID, userType, and success status
    return res.status(200).json({ userID, ownerID, tenantID, success: true });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API 2: Signup Contact Verification
app.post("/api/signup-contact", async (req, res) => {
  // Inputs
  const { userID, email, phone } = req.body;
  
  try {
    if (userID) {
      // Fetch email and phone associated with the provided userID
      const userCredentialsQuery = await db.query(
        "SELECT email, phone FROM UserInformation WHERE id = $1",
        [userID]
      );

      // Check if the user with the given userID exists
      if (userCredentialsQuery.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get the email and phone associated with the userID
      const { email: userStoredEmail, phone: userStoredPhone } = userCredentialsQuery.rows[0];

      // Check if both email and phone are unchanged
      if (email === userStoredEmail && phone === userStoredPhone) {
        return res.status(200).json({ success: true });
      } else {
        let errorResponse = null;

        // If both are not the same, check each one individually
        if (email !== userStoredEmail) {
          // Check if the new email exists in the database
          const emailQuery = await db.query(
            "SELECT * FROM UserInformation WHERE email = $1",
            [email]
          );

          if (emailQuery.rows.length > 0) {
            errorResponse = "This email is already associated with an existing account";
          }
        }

        if (phone !== userStoredPhone) {
          // Check if the new phone exists in the database
          const phoneQuery = await db.query(
            "SELECT * FROM UserInformation WHERE phone = $1",
            [phone]
          );

          if (phoneQuery.rows.length > 0) {
            errorResponse = "This phone number is already associated with an existing account";
          }
        }

        if (errorResponse) {
          return res.status(420).json({ error: errorResponse });
        } else {
          return res.status(200).json({ success: true });
        }
      }
    } else {
      // Check if the email or phone is already associated with an existing account
      const userQuery = await db.query(
        "SELECT * FROM UserInformation WHERE email = $1 OR phone = $2",
        [email, phone]
      );

      if (userQuery.rows.length > 0) {
        return res.status(420).json({
          error: "These credentials are not available to existing accounts",
        });
      }

      return res.status(200).json({ success: true });
    }
  } catch (error) {
    console.error("Error during verification of contacts:", error);
    return res.status(500).json({ error: "Internal Server error" });
  }
});

// API 3: Register Account
app.post("/api/register-account", async (req, res) => {
  //Inputs
  const { userType, firstName, lastName, DOB, email, phone, password } =
    req.body;
  try {
    //Creating a new record in user table
    const userQuery = await db.query(`
      INSERT INTO UserInformation (firstname, lastname, dob, email, phone, md5password) 
      VALUES ($1,$2,$3,$4,$5,$6) 
      RETURNING id;`,
      [firstName, lastName, DOB, email, phone, password]
    );
    //Extracting userID
    const userID = userQuery.rows[0].id;
    //Create the type of user (Owner or Tenant)
    let ownerID = 0,
      tenantID = 0;
    if (userType === "owner") {
      const ownerQuery = await db.query(
        "INSERT INTO Owner (userID) VALUES ($1) RETURNING id;",
        [userID]
      );
      ownerID = ownerQuery.rows[0].id;
    } else {
      const tenantQuery = await db.query(
        "INSERT INTO Tenant (userID) VALUES ($1) RETURNING id;",
        [userID]
      );
      tenantID = tenantQuery.rows[0].id;
    }
    //digi code is the first 8 and last 8 digits of the password which is in md5
    const digiCode = password.slice(0, 8) + password.slice(-8);
    console.log(digiCode);
    //Return userID, ownerID, tenantID, digicode, success status
    return res.status(200).json({ userID, ownerID, tenantID, digiCode, success: true });
  } catch (error) {
    console.error("Error during registration of user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 4: New Role Registration
app.post("/api/new-role-registration", async (req, res) => {
  //Inputs
  const { userID, userType } = req.body;
  try {
    console.log(userID);
    console.log(userType);
    //Creating new userType
    let ownerID = 0,
      tenantID = 0;
    if (userType === "owner") {
      const ownerQuery = await db.query(
        "INSERT INTO Owner (userID) VALUES ($1) RETURNING id;",
        [userID]
      );
      ownerID = ownerQuery.rows[0].id;
    } else if (userType === "tenant") {
      const tenantQuery = await db.query(
        "INSERT INTO Tenant (userID) VALUES ($1) RETURNING id;",
        [userID]
      );
      tenantID = tenantQuery.rows[0].id;
    }
    //Return userID, ownerID, tenantID, success status
    return res.status(200).json({ userID, ownerID, tenantID, success: true });
  } catch (error) {
    console.error("Error during new role registration:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 5: Change Password
app.post("/api/change-password", async (req, res) => {
  //Inputs
  const { userID, oldPassword, newPassword } = req.body;
  try {
    const userQuery = await db.query(
      "SELECT * FROM UserInformation WHERE id = $1",
      [userID]
    );
    if (userQuery.rows.length > 0) {
      if (userQuery.rows[0].md5password === oldPassword) {
        db.query("UPDATE userinformation SET md5password=$1 WHERE id = $2;", [
          newPassword,
          userID,
        ]);
        //digi code is the first 8 and last 8 digits of the password which is in md5
        const digiCode = newPassword.slice(0, 8) + newPassword.slice(-8);
        return res.status(200).json({ digiCode, success: true });
      }
    }
    return res.status(400).json({ error: "Old Password Does not match" });
  } catch (error) {
    console.error("Error during changing password:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 6: Report A Bug
app.post("/api/report-bug", async (req, res) => {
  //Inputs
  const { userID, userType, bugType, bugDescription } = req.body;
  try {
    const bugStatus = 'P';
    const userQuery = await db.query(
      "INSERT INTO ReportedBug (userID, userType, bugType, bugDescription, bugStatus) VALUES ($1,$2,$3,$4,$5) ",
      [userID, userType, bugType, bugDescription, bugStatus]
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error during reporting a bug:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 7: Notification Analytics (Owner)
app.post("/api/notification-analytics", async (req, res) => {
  const { ownerID } = req.body;
  try {
    // Query for counting different types of notifications
    const query = `
            SELECT notificationType, COUNT(*) as count 
            FROM Notification 
            WHERE ownerID = $1 
            GROUP BY notificationType;
        `;
    const result = await db.query(query, [ownerID]);

    // Preparing the response
    let rentNotification = 0,
      tenantNotification = 0,
      managerNotification = 0;
    result.rows.forEach((row) => {
      switch (row.notificationtype) {
        case "RNT":
          rentNotification = parseInt(row.count);
          break;
        case "TNT":
          tenantNotification = parseInt(row.count);
          break;
        case "MGR":
          managerNotification = parseInt(row.count);
          break;
      }
    });

    res
      .status(200)
      .json({
        rentNotification,
        tenantNotification,
        managerNotification,
        success: true,
      });
  } catch (error) {
    console.error("Error during notification analytics:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 8: Notification List
app.post("/api/notification-list", async (req, res) => {
  const { ownerID } = req.body;
  try {
    // Query to get all notifications along with tenant names
    const query = `
            SELECT n.*, ui.firstName, ui.lastName 
            FROM Notification n
            JOIN Tenant t ON n.tenantID = t.id
            JOIN UserInformation ui ON t.userID = ui.id
            WHERE n.ownerID = $1
            ORDER BY n.id DESC;
        `;
    const notifications = await db.query(query, [ownerID]);

    // Check if notifications exist
    if (notifications.rows.length === 0) {
      return res.status(404).json({ error: "No notifications found" });
    }

    // Preparing the response
    const notificationList = notifications.rows.map((n) => ({
      notificationID: n.id,
      notificationType: n.notificationtype,
      tenantName: `${n.firstname} ${n.lastname}`,
      // Include other relevant notification details if needed
    }));

    res.status(200).json({ notificationList, success: true });
  } catch (error) {
    console.error("Error during notification list:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 9: Month Analytics
app.post("/api/month-analytics", async (req, res) => {
  const { ownerID } = req.body;
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
  const currentYear = currentDate.getFullYear();
  const monthName = getCurrentMonthName(currentMonth);

  try {
    // Query for totalProfit, totalProperty, totalReceived, pendingRent
    const profitQuery = `
            SELECT SUM(amount) as totalProfit
            FROM RentTransaction
            WHERE ownerID = $1 AND EXTRACT(MONTH FROM PaymentDateTime) = $2;
        `;
    const propertyQuery = `
            SELECT COUNT(*) as totalProperty
            FROM Property
            WHERE ownerID = $1 AND dueDate != '0';
        `;
    const receivedQuery = `
            SELECT COUNT(*) as totalReceived
            FROM RentTransaction
            WHERE ownerID = $1 AND EXTRACT(MONTH FROM PaymentDateTime) = $2;
        `;

    // Executing queries
    const totalProfitResult = await db.query(profitQuery, [
      ownerID,
      currentMonth,
    ]);
    const totalPropertyResult = await db.query(propertyQuery, [ownerID]);
    const totalReceivedResult = await db.query(receivedQuery, [
      ownerID,
      currentMonth,
    ]);

    // Preparing the response
    const response = {
      currentMonth: monthName,
      currentYear: currentYear,
      totalProfit: totalProfitResult.rows[0].totalprofit || 0,
      totalProperty: totalPropertyResult.rows[0].totalproperty || 0,
      totalReceived: totalReceivedResult.rows[0].totalreceived || 0,
      pendingRent: String(parseInt(totalPropertyResult.rows[0].totalproperty) - parseInt(totalReceivedResult.rows[0].totalreceived)) || 0,
      success: true,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error during month analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper function to get the current month name with the first character capitalized
function getCurrentMonthName(monthIndex) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[monthIndex - 1];
}

// API 10: Monthly Analytics
app.post("/api/monthly-analytics", async (req, res) => {
  const { ownerID } = req.body;
  try {
    // Query to find the first transaction date
    const firstTransactionQuery = `
            SELECT EXTRACT(YEAR FROM PaymentDateTime) as year, EXTRACT(MONTH FROM PaymentDateTime) as month
            FROM RentTransaction
            WHERE ownerID = $1
            ORDER BY PaymentDateTime ASC
            LIMIT 1;
        `;
    const firstTransactionResult = await db.query(firstTransactionQuery, [
      ownerID,
    ]);

    // Check if there is any transaction data
    if (firstTransactionResult.rows.length === 0) {
      return res.status(404).json({ error: "No transaction data found" });
    }

    // Preparing to loop through months
    const startYear = firstTransactionResult.rows[0].year;
    const startMonth = firstTransactionResult.rows[0].month;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // JavaScript months are 0-indexed
    let monthlyData = [];

    // Loop through each month
    for (let year = startYear; year <= currentYear; year++) {
      for (
        let month = year === startYear ? startMonth : 1;
        month <= (year === currentYear ? currentMonth : 12);
        month++
      ) {
        const monthQuery = `
                    SELECT SUM(amount) as profit
                    FROM RentTransaction
                    WHERE ownerID = $1 AND EXTRACT(YEAR FROM PaymentDateTime) = $2 AND EXTRACT(MONTH FROM PaymentDateTime) = $3;
                `;
        const monthResult = await db.query(monthQuery, [ownerID, year, month]);
        monthlyData.push({
          year: year,
          month: getCurrentMonthName(parseInt(month, 10)),
          profit: monthResult.rows[0].profit || 0,
        });
      }
    }
    monthlyData = monthlyData.reverse();
    res.status(200).json({ monthlyData, success: true });
  } catch (error) {
    console.error("Error during monthly analytics:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 11: Add Property
app.post("/api/add-property", async (req, res) => {
  //Inputs
  const { ownerID, rent, dueDate, propertyAddress } = req.body;
  try {
    const propertyQuery = await db.query(
      `INSERT INTO 
        Property (ownerID, tenantID, rent, dueDate, propertyAddress) 
        VALUES ($1,0,$2,$3,$4)
        RETURNING id;`,
      [ownerID, rent, dueDate, propertyAddress]
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error during adding properties:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 12: Property List
app.post("/api/property-list", async (req, res) => {
  const { ownerID } = req.body;
  try {
    // Query to get the properties along with tenantID
    const propertyQuery = `
      SELECT p.id as propertyID, p.propertyaddress, p.tenantID, SUM(rt.amount) as totalProfit
      FROM Property p
      LEFT JOIN RentTransaction rt ON p.id = rt.propertyID
      WHERE p.ownerID = $1 AND p.dueDate != '0'
      GROUP BY p.id, p.tenantID
      ORDER BY p.id;
    `;
    const properties = await db.query(propertyQuery, [ownerID]);

    // Check if properties exist
    if (properties.rows.length === 0) {
      return res.status(404).json({ error: "No properties found" });
    }

    // Preparing the response with tenantID included
    const propertyList = properties.rows.map((p) => ({
      propertyID: p.propertyid,
      propertyAddress: p.propertyaddress,
      tenantID: p.tenantid,
      totalProfit: p.totalprofit || 0,
      status: p.tenantid ? "On-rent" : "Vacant",
    }));

    res.status(200).json({ propertyList, success: true });
  } catch (error) {
    console.error("Error during property list:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 13: Admin - List of Owners
app.post("/api/admin/list-owners", async (req, res) => {
  try {
    // Query to get information about owners with DOB in YYYY-MM-DD format
    const ownersQuery = `
      SELECT
        CONCAT(ui.firstname, ' ', ui.lastname) AS ownerName,
        TO_CHAR(ui.dob, 'YYYY-MM-DD') AS dob, -- Fetch DOB in YYYY-MM-DD format
        ui.email AS email,
        ui.phone AS phone,
        o.id AS ownerID,
        ui.id AS userID,
        CASE
          WHEN ui.md5password = '00000000000000000000000000000000' THEN 'banned'
          ELSE 'un-banned'
        END AS status
      FROM Owner o
      JOIN UserInformation ui ON o.userID = ui.id;
    `;
    const owners = await db.query(ownersQuery);

    res.status(200).json({ owners: owners.rows, success: true });
  } catch (error) {
    console.error("Error while fetching list of owners:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 14: Admin - List of Tenants
app.post("/api/admin/list-tenants", async (req, res) => {
  try {
    // Query to get information about tenants with DOB in YYYY-MM-DD format
    const tenantsQuery = `
      SELECT
        CONCAT(ui.firstname, ' ', ui.lastname) AS tenantName,
        TO_CHAR(ui.dob, 'YYYY-MM-DD') AS dob, -- Fetch DOB in YYYY-MM-DD format
        ui.email AS email,
        ui.phone AS phone,
        t.id AS tenantID,
        ui.id AS userID,
        CASE
          WHEN ui.md5password = '00000000000000000000000000000000' THEN 'banned'
          ELSE 'un-banned'
        END AS status
      FROM Tenant t
      JOIN UserInformation ui ON t.userID = ui.id;
    `;
    const tenants = await db.query(tenantsQuery);

    res.status(200).json({ tenants: tenants.rows, success: true });
  } catch (error) {
    console.error("Error while fetching list of tenants:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 15: Admin - Delete Owner
app.delete("/api/admin/delete-owner", async (req, res) => {
  const { ownerID } = req.body; // Read ownerID from the request body
  try {
    // Delete the owner instance from the database
    const result = await db.query("DELETE FROM Owner WHERE id = $1", [ownerID]); 

    // Check if the deletion was successful
    if (result.rowCount === 1) {
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: "Owner not found" });
    }
  } catch (error) {
    console.error("Error while deleting owner:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 16: Admin - Delete Tenant
app.delete("/api/admin/delete-tenant", async (req, res) => {
  const { tenantID } = req.body; // Read tenantID from the request body
  try {
    // Delete the tenant instance from the database
    const result = await db.query("DELETE FROM Tenant WHERE id = $1", [tenantID]);

    // Check if the deletion was successful
    if (result.rowCount === 1) {
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: "Tenant not found" });
    }
  } catch (error) {
    console.error("Error while deleting tenant:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 17: Admin - Edit User
app.put("/api/admin/edit-user", async (req, res) => {
  const { userID, userName, DOB, email, phone } = req.body;
  
  // Extracting firstName and lastName from userName
  const spaceIndex = userName.indexOf(' ');
  const firstName = spaceIndex === -1 ? userName : userName.substring(0, spaceIndex);
  const lastName = spaceIndex === -1 ? '' : userName.substring(spaceIndex + 1);
  try {
    // Update owner information in the database
    await db.query(
      "UPDATE UserInformation SET firstname=$1, lastname=$2, dob=$3, email=$4, phone=$5 WHERE id = $6;",
      [firstName, lastName, DOB, email, phone, userID]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error while editing owner:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 18: Owner Details
app.post("/api/owner-details", async (req, res) => {
  // Inputs
  const { ownerID } = req.body;

  try {
    // Query to fetch owner details based on ownerID
    const ownerDetailsQuery = `
      SELECT
      CONCAT(ui.firstName, ' ', ui.lastName) AS ownerName,
        ui.email AS email,
        ui.phone AS phone,
        ui.DOB AS DOB
      FROM Owner o
      JOIN UserInformation ui ON o.userID = ui.id
      WHERE o.id = $1;
    `;

    const ownerDetails = await db.query(ownerDetailsQuery, [ownerID]);

    // Check if owner details exist
    if (ownerDetails.rows.length === 0) {
      return res.status(404).json({ error: "Owner not found" });
    }

    // Extract owner details
    const { ownername, email, phone, dob } = ownerDetails.rows[0];
    var correctDate = new Date(dob).toLocaleDateString();;
    // Parse the input date
    const parsedDate = new Date(correctDate);

    // Get year, month, and day components from the parsed date
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0'); // Adding 1 to month as it's zero-based
    const day = String(parsedDate.getDate()).padStart(2, '0');

    const DOB = `${year}-${month}-${day}`;
    // Prepare and send the response
    res.status(200).json({ ownerName: ownername, email, phone, DOB, success: true });
  } catch (error) {
    console.error("Error while fetching owner details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 19: Tenant Details
app.post("/api/tenant-details", async (req, res) => {
  // Inputs
  const { tenantID } = req.body;

  try {
    // Query to fetch owner details based on ownerID
    const tenantDetailsQuery = `
      SELECT
        CONCAT(ui.firstName, ' ', ui.lastName) AS tenantName,
        ui.email AS email,
        ui.phone AS phone,
        ui.DOB AS DOB
      FROM Tenant t
      JOIN UserInformation ui ON t.userID = ui.id
      WHERE t.id = $1;
    `;

    const tenantDetails = await db.query(tenantDetailsQuery, [tenantID]);

    // Check if owner details exist
    if (tenantDetails.rows.length === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Extract owner details
    const { tenantname, email, phone, dob } = tenantDetails.rows[0];

    var correctDate = new Date(dob).toLocaleDateString();;
    // Parse the input date
    const parsedDate = new Date(correctDate);

    // Get year, month, and day components from the parsed date
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0'); // Adding 1 to month as it's zero-based
    const day = String(parsedDate.getDate()).padStart(2, '0');

    const DOB = `${year}-${month}-${day}`;
    // Prepare and send the response
    res.status(200).json({ tenantName : tenantname, email, phone, DOB , success: true });
  } catch (error) {
    console.error("Error while fetching tenant details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 20: Auth: Reset Password
app.post('/api/reset-password', async (req, res) => {
  const { emailOrPhone, currentDigiCode, newPassword } = req.body;

  try {
    // Fetch user from the database based on emailOrPhone
    const userQuery = await db.query('SELECT * FROM UserInformation WHERE email = $1 OR phone = $1', [emailOrPhone]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const password = userQuery.rows[0].md5password;

    // Compare the digiCode with the first and last 8 digits of the hashed password

    const databaseDigiCode = password.slice(0, 8) + password.slice(-8);

    if (databaseDigiCode !== currentDigiCode) {
      return res.status(400).json({ error: 'Invalid digiCode' });
    }

    // Update user's password in the database with the new password
    await db.query('UPDATE UserInformation SET md5password = $1 WHERE id = $2', [newPassword, userQuery.rows[0].id]);

    const digiCode = newPassword.slice(0, 8) + newPassword.slice(-8);

    return res.status(200).json({ digiCode, success: true }); // or any other success message

  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API 21: Owner - Register Tenant to Property
app.post("/api/owner/register-tenant", async (req, res) => {
  // Inputs
  const { propertyID, tenantEmailorPhone } = req.body;
  try {
    // Find the user by their email or phone in the UserInformation table
    const userQuery = await db.query(
      "SELECT id FROM UserInformation WHERE email = $1 OR phone = $1",
      [tenantEmailorPhone]
    );

    // Check if the user exists
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userID = userQuery.rows[0].id;

    // Check if the user is registered as a tenant in the Tenant table
    const tenantQuery = await db.query(
      "SELECT id FROM Tenant WHERE userID = $1",
      [userID]
    );

    // Check if the user is registered as a tenant
    if (tenantQuery.rows.length === 0) {
      return res.status(404).json({ error: "User is not registered as a tenant" });
    }

    const tenantID = tenantQuery.rows[0].id;

    // Update the property's tenantID with the found tenantID
    await db.query(
      "UPDATE Property SET tenantID = $1 WHERE id = $2",
      [tenantID, propertyID]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error registering tenant to property:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 22: Owner - Un-register Tenant from Property
app.post("/api/owner/unregister-tenant", async (req, res) => {
  // Inputs
  const { propertyID } = req.body;
  try {
    // Replace tenantID in the Property table with 0 for the given propertyID
    await db.query(
      "UPDATE Property SET tenantID = 0 WHERE id = $1",
      [propertyID]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error unregistering tenant from property:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 23: Owner - Edit Property
app.post("/api/edit-property", async (req, res) => {
  // Inputs
  const { propertyID, propertyAddress, dueDate, rent } = req.body;
  try {
    // Update new values into the Property table corresponding to propertyID
    await db.query(
      "UPDATE Property SET propertyaddress = $1, duedate = $2, rent = $3 WHERE id = $4",
      [propertyAddress, dueDate, rent, propertyID]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error editing property:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 24: Owner - Fetch Property Data
app.post("/api/fetch-property", async (req, res) => {
  // Input
  const { propertyID } = req.body;
  try {
    // Fetch property details for the given propertyID
    const propertyQuery = await db.query(
      "SELECT propertyaddress, duedate, rent FROM Property WHERE id = $1",
      [propertyID]
    );

    if (propertyQuery.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    const { propertyaddress, duedate, rent } = propertyQuery.rows[0];
    return res.status(200).json({ propertyAddress : propertyaddress, dueDate: duedate, rent, success: true });
  } catch (error) {
    console.error("Error fetching property data:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 25: Admin - User Complaints
app.post("/api/admin/user-complaints", async (req, res) => {
  try {
    // Fetch all user complaints from ReportedBug table
    const complaintsQuery = await db.query("SELECT * FROM ReportedBug");

    return res.status(200).json({ bugData: complaintsQuery.rows, success: true });
  } catch (error) {
    console.error("Error fetching user complaints:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 26: Admin - User Information
app.get("/api/admin/user-info", async (req, res) => {
  try {
    // Fetch total number of registered users from UserInformation table
    const totalUsersQuery = await db.query("SELECT COUNT(*) FROM UserInformation");
    const totalUsers = parseInt(totalUsersQuery.rows[0].count);

    // Fetch total number of owners from Owner table
    const totalOwnersQuery = await db.query("SELECT COUNT(*) FROM Owner");
    const totalOwners = parseInt(totalOwnersQuery.rows[0].count);

    // Fetch total number of tenants from Tenant table
    const totalTenantsQuery = await db.query("SELECT COUNT(*) FROM Tenant");
    const totalTenants = parseInt(totalTenantsQuery.rows[0].count);

    return res.status(200).json({ totalUsers, totalOwners, totalTenants, success: true });
  } catch (error) {
    console.error("Error fetching user information:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 27: Admin - Ban User
app.post("/api/admin/ban-user", async (req, res) => {
  // Input
  const { userID } = req.body;
  try {
    // Find user by their userID in UserInformation and update their password to 32 zeros
    await db.query("UPDATE UserInformation SET md5password='00000000000000000000000000000000' WHERE id = $1", [
      userID,
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error banning user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 28: Admin - Un-ban User
app.post("/api/admin/unban-user", async (req, res) => {
  // Input
  const { userID } = req.body;
  try {
    // Find user by their userID in UserInformation and update their password to a hashed value of their email
    const userQuery = await db.query("SELECT email FROM UserInformation WHERE id = $1", [userID]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userEmail = userQuery.rows[0].email;

    // Hash the email to generate a new password
    const hashedPassword = md5(userEmail);

    await db.query("UPDATE UserInformation SET md5password=$1 WHERE id = $2", [
      hashedPassword,
      userID,
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error unbanning user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});