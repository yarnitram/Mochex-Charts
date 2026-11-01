/**
 * Standalone Zero-Dependency PocketBase Initializer
 * Uses native Node.js fetch (Node 18+) so it can run anywhere without node_modules!
 *
 * Usage:
 *   node scripts/init-pocketbase.mjs [adminEmail] [adminPassword] [pbUrl]
 *
 * Example:
 *   node scripts/init-pocketbase.mjs support@mochex.com YourPassword http://127.0.0.1:8090
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adminEmail = process.argv[2] || process.env.PB_ADMIN_EMAIL || "support@mochex.com";
const adminPassword = process.argv[3] || process.env.PB_ADMIN_PASSWORD;
const pbUrl = (process.argv[4] || process.env.POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");

if (!adminPassword) {
  console.error("Error: Admin password must be provided as an argument or PB_ADMIN_PASSWORD env var.");
  console.error("Usage: node scripts/init-pocketbase.mjs <adminEmail> <adminPassword> [pbUrl]");
  process.exit(1);
}

async function main() {
  console.log(`Connecting to PocketBase at: ${pbUrl}`);

  // 1. Authenticate as superuser or admin
  let token = "";
  try {
    const res = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
    });
    if (res.ok) {
      const data = await res.json();
      token = data.token;
      console.log(`Successfully authenticated as superuser: ${adminEmail}`);
    }
  } catch (err) {
    console.warn("Superusers auth endpoint check failed:", err.message);
  }

  if (!token) {
    try {
      const res = await fetch(`${pbUrl}/api/admins/auth-with-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
      });
      if (res.ok) {
        const data = await res.json();
        token = data.token;
        console.log(`Successfully authenticated as admin: ${adminEmail}`);
      }
    } catch (err) {
      console.warn("Admins auth endpoint check failed:", err.message);
    }
  }

  if (!token) {
    console.error("Failed to authenticate with PocketBase. Please check the email and password.");
    process.exit(1);
  }

  // 2. Load schema JSON
  const schemaPath = path.join(__dirname, "pb_schema.json");
  const schemaRaw = fs.readFileSync(schemaPath, "utf-8");
  const collections = JSON.parse(schemaRaw);

  // 3. Import collections
  console.log("Importing collections (chart_layouts, indicators, watchlists)...");
  const importRes = await fetch(`${pbUrl}/api/collections/import`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({
      collections,
      deleteMissing: false,
    }),
  });

  if (!importRes.ok) {
    const errData = await importRes.text();
    console.error("Collection import response:", errData);
  } else {
    console.log("Collections imported successfully!");
  }

  // 4. Ensure 'role' field on 'users' collection
  try {
    const usersRes = await fetch(`${pbUrl}/api/collections/users`, {
      headers: { Authorization: token },
    });
    if (usersRes.ok) {
      const usersData = await usersRes.json();
      const fields = usersData.fields || usersData.schema || [];
      const hasRole = fields.some((f) => f.name === "role");

      if (!hasRole) {
        console.log("Adding 'role' field to users collection...");
        const roleField = {
          name: "role",
          type: "select",
          required: false,
          maxSelect: 1,
          values: ["TRADER", "ADMIN"],
        };

        if (usersData.fields) {
          usersData.fields.push(roleField);
        } else if (usersData.schema) {
          usersData.schema.push(roleField);
        }

        const updateRes = await fetch(`${pbUrl}/api/collections/users`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: token,
          },
          body: JSON.stringify(usersData),
        });

        if (updateRes.ok) {
          console.log("Successfully added 'role' field to users collection!");
        }
      } else {
        console.log("'role' field already exists on users collection.");
      }
    }
  } catch (err) {
    console.warn("Role field update check skipped:", err.message);
  }

  console.log("\nPocketBase initialization complete! All collections are ready.");
}

main().catch((err) => {
  console.error("Error initializing PocketBase:", err);
  process.exit(1);
});
