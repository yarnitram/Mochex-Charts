/**
 * PocketBase Collection Initializer / Schema Bootstrap Script
 * Usage:
 *   node scripts/init-pocketbase.mjs [adminEmail] [adminPassword] [pbUrl]
 *
 * Example:
 *   node scripts/init-pocketbase.mjs admin@mochex.io Password123! http://127.0.0.1:8090
 */

import PocketBase from "pocketbase";

const pbUrl = process.argv[4] || process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
const adminEmail = process.argv[2] || process.env.PB_ADMIN_EMAIL || "admin@mochex.io";
const adminPassword = process.argv[3] || process.env.PB_ADMIN_PASSWORD || "AdminPassword123!";

const pb = new PocketBase(pbUrl);

async function main() {
  console.log(`Connecting to PocketBase at: ${pbUrl}`);

  // 1. Authenticate or create superuser/admin
  try {
    // PocketBase v0.22+ supports superusers collection or admins
    try {
      await pb.collection("_superusers").authWithPassword(adminEmail, adminPassword);
      console.log(`Authenticated as superuser: ${adminEmail}`);
    } catch {
      try {
        await pb.admins.authWithPassword(adminEmail, adminPassword);
        console.log(`Authenticated as admin: ${adminEmail}`);
      } catch {
        console.log(`Creating initial admin / superuser account (${adminEmail})...`);
        try {
          await pb.collection("_superusers").create({
            email: adminEmail,
            password: adminPassword,
            passwordConfirm: adminPassword,
          });
          await pb.collection("_superusers").authWithPassword(adminEmail, adminPassword);
        } catch {
          await pb.admins.create({
            email: adminEmail,
            password: adminPassword,
            passwordConfirm: adminPassword,
          });
          await pb.admins.authWithPassword(adminEmail, adminPassword);
        }
        console.log("Admin account successfully created and authenticated!");
      }
    }
  } catch (err) {
    console.warn("Notice: Admin auth failed or skipped:", err?.message);
    console.log("Proceeding with collection initialization...");
  }

  // 2. Ensure role field exists on `users` collection
  try {
    const usersCollection = await pb.collections.getOne("users");
    const fields = usersCollection.fields || usersCollection.schema || [];
    const hasRole = fields.some((f) => f.name === "role");

    if (!hasRole) {
      console.log("Adding 'role' field to 'users' collection...");
      const roleField = {
        name: "role",
        type: "select",
        required: false,
        maxSelect: 1,
        values: ["TRADER", "ADMIN"],
      };
      if (usersCollection.fields) {
        usersCollection.fields.push(roleField);
      } else if (usersCollection.schema) {
        usersCollection.schema.push(roleField);
      }
      await pb.collections.update("users", usersCollection);
      console.log("Updated 'users' collection with 'role' field.");
    } else {
      console.log("'role' field already exists in 'users' collection.");
    }
  } catch (err) {
    console.warn("Could not check/update users collection:", err?.message);
  }

  // 3. Helper to create collection if missing
  async function ensureCollection(name, schemaDefinition) {
    try {
      await pb.collections.getOne(name);
      console.log(`Collection '${name}' already exists.`);
    } catch {
      console.log(`Creating collection '${name}'...`);
      await pb.collections.create({
        name,
        type: "base",
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        ...schemaDefinition,
      });
      console.log(`Collection '${name}' created successfully.`);
    }
  }

  // Ensure chart_layouts
  await ensureCollection("chart_layouts", {
    fields: [
      { name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "name", type: "text", required: true },
      { name: "symbol", type: "text" },
      { name: "resolution", type: "text" },
      { name: "content", type: "json" },
      { name: "is_default", type: "bool" },
    ],
  });

  // Ensure indicators
  await ensureCollection("indicators", {
    fields: [
      { name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "name", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "script_code", type: "text", required: true },
      { name: "inputs_schema", type: "json" },
      { name: "is_global", type: "bool" },
    ],
  });

  // Ensure watchlists
  await ensureCollection("watchlists", {
    fields: [
      { name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "name", type: "text", required: true },
      { name: "symbols", type: "json" },
      { name: "is_default", type: "bool" },
    ],
  });

  console.log("\nPocketBase initialization completed successfully!");
}

main().catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});
