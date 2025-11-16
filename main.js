#!/usr/bin/env node

// ----- Імпорт модулів -----
const http = require("http");
const express = require("express");
const { program } = require("commander");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const multer = require("multer");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

// ----- Налаштування командного рядка -----
program
  .requiredOption("-h, --host <host>", "Host address")
  .requiredOption("-p, --port <port>", "Port number")
  .requiredOption("-c, --cache <path>", "Cache directory");

program.parse(process.argv);
const options = program.opts();

const HOST = options.host;
const PORT = parseInt(options.port, 10);
const CACHE_DIR = path.resolve(options.cache);
const INVENTORY_FILE = path.join(CACHE_DIR, "inventory.json");

// ----- Підготовка кеш-директорії -----
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ----- Функції роботи з інвентарем -----
async function loadInventory() {
  try {
    const data = await fsp.readFile(INVENTORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

async function saveInventory(items) {
  await fsp.writeFile(INVENTORY_FILE, JSON.stringify(items, null, 2), "utf-8");
}

function findItem(items, id) {
  return items.find((item) => item.id === id);
}

// ----- Налаштування Express -----
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----- Multer (фото) -----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CACHE_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, unique + ext);
  },
});
const upload = multer({ storage });

// ----- Swagger -----
const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Inventory Service API",
    version: "1.0.0",
    description: "Сервіс інвентаризації для лабораторної роботи №6",
  },
  servers: [{ url: `http://${HOST}:${PORT}` }],
};

const swaggerOptions = {
  definition: swaggerDefinition,
  apis: [__filename],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * components:
 *   schemas:
 *     InventoryItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         inventory_name:
 *           type: string
 *         description:
 *           type: string
 *         photoUrl:
 *           type: string
 */

// ----- HTML-форми -----
app.get("/RegisterForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "RegisterForm.html"));
});

app.get("/SearchForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "SearchForm.html"));
});

// ----- POST /register -----
app.post("/register", upload.single("photo"), async (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name || inventory_name.trim() === "") {
    return res.status(400).json({ error: "inventory_name is required" });
  }

  const items = await loadInventory();
  const newId = String(Date.now());

  let photoFilename = null;
  let photoUrl = null;

  if (req.file) {
    photoFilename = req.file.filename;
    photoUrl = `/inventory/${newId}/photo`;
  }

  const newItem = {
    id: newId,
    inventory_name,
    description: description || "",
    photoFilename,
    photoUrl,
  };

  items.push(newItem);
  await saveInventory(items);

  res.status(201).json(newItem);
});

// allow only POST
app.all("/register", (req, res, next) => {
  if (req.method === "POST") return next();
  res.status(405).json({ error: "Method not allowed" });
});

// ----- GET /inventory -----
app.get("/inventory", async (req, res) => {
  const items = await loadInventory();
  res.json(
    items.map((item) => ({
      id: item.id,
      inventory_name: item.inventory_name,
      description: item.description,
      photoUrl: item.photoUrl,
    }))
  );
});

// ❗ FIX — пропускаємо GET і OPTIONS
app.all("/inventory", (req, res, next) => {
  if (["GET", "OPTIONS"].includes(req.method)) return next();
  res.status(405).json({ error: "Method not allowed" });
});

// ----- GET /inventory/:id -----
app.get("/inventory/:id", async (req, res) => {
  const id = req.params.id;
  const items = await loadInventory();
  const item = findItem(items, id);

  if (!item) return res.status(404).json({ error: "Item not found" });

  res.json(item);
});

// ----- PUT /inventory/:id -----
app.put("/inventory/:id", async (req, res) => {
  const id = req.params.id;
  const { inventory_name, description } = req.body;

  const items = await loadInventory();
  const item = findItem(items, id);

  if (!item) return res.status(404).json({ error: "Item not found" });

  if (inventory_name?.trim()) item.inventory_name = inventory_name;
  if (description !== undefined) item.description = description;

  await saveInventory(items);
  res.json(item);
});

// ----- DELETE /inventory/:id -----
app.delete("/inventory/:id", async (req, res) => {
  const id = req.params.id;
  const items = await loadInventory();
  const index = items.findIndex((it) => it.id === id);

  if (index === -1) return res.status(404).json({ error: "Item not found" });

  const [deleted] = items.splice(index, 1);

  if (deleted.photoFilename) {
    const photoPath = path.join(CACHE_DIR, deleted.photoFilename);
    if (fs.existsSync(photoPath)) await fsp.unlink(photoPath);
  }

  await saveInventory(items);
  res.json({ message: "Deleted", id });
});

// allow only GET, PUT, DELETE
app.all("/inventory/:id", (req, res, next) => {
  if (["GET", "PUT", "DELETE"].includes(req.method)) return next();
  res.status(405).json({ error: "Method not allowed" });
});

// ----- GET /inventory/:id/photo -----
app.get("/inventory/:id/photo", async (req, res) => {
  const id = req.params.id;
  const items = await loadInventory();
  const item = findItem(items, id);

  if (!item?.photoFilename) {
    return res.status(404).json({ error: "Photo not found" });
  }

  const photoPath = path.join(CACHE_DIR, item.photoFilename);
  if (!fs.existsSync(photoPath)) {
    return res.status(404).json({ error: "Photo file not found" });
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.sendFile(photoPath);
});

// ----- PUT /inventory/:id/photo -----
app.put("/inventory/:id/photo", upload.single("photo"), async (req, res) => {
  const id = req.params.id;
  const items = await loadInventory();
  const item = findItem(items, id);

  if (!item) {
    if (req.file) await fsp.unlink(req.file.path);
    return res.status(404).json({ error: "Item not found" });
  }

  if (item.photoFilename) {
    const oldPath = path.join(CACHE_DIR, item.photoFilename);
    if (fs.existsSync(oldPath)) await fsp.unlink(oldPath);
  }

  if (req.file) {
    item.photoFilename = req.file.filename;
    item.photoUrl = `/inventory/${id}/photo`;
  }

  await saveInventory(items);
  res.json(item);
});

// allow only GET and PUT
app.all("/inventory/:id/photo", (req, res, next) => {
  if (["GET", "PUT"].includes(req.method)) return next();
  res.status(405).json({ error: "Method not allowed" });
});

// ----- POST /search -----
app.post("/search", async (req, res) => {
  const { id, has_photo } = req.body;

  const items = await loadInventory();
  const item = findItem(items, id);

  if (!item) return res.status(404).send("Item not found");

  let description = item.description || "";
  if (has_photo && item.photoUrl) {
    description += `<br><a href="${item.photoUrl}">Photo link</a>`;
  }

  res.status(200).send(`
    <h1>Search result</h1>
    <p><strong>ID:</strong> ${item.id}</p>
    <p><strong>Name:</strong> ${item.inventory_name}</p>
    <p><strong>Description:</strong> ${description}</p>
  `);
});

// only POST
app.all("/search", (req, res, next) => {
  if (req.method === "POST") return next();
  res.status(405).json({ error: "Method not allowed" });
});

// ----- 404 -----
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ----- Створення HTTP-сервера -----
http.createServer(app).listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
