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
  await fsp.writeFile(INVENTORY_FILE, JSON.stringify(items, null, 2));
}

function findItem(items, id) {
  return items.find((item) => item.id === id);
}

// ----- Express -----
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----- Multer -----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CACHE_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ----- Swagger Configuration -----
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Inventory API",
      version: "1.0.0",
      description: "API для управління інвентарем з можливістю завантаження фото",
    },
    servers: [
      {
        url: `http://${HOST}:${PORT}`,
        description: "Development server",
      },
    ],
  },
  apis: [__filename],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// ----- HTML -----
app.get("/RegisterForm.html", (req, res) =>
  res.sendFile(path.join(__dirname, "RegisterForm.html"))
);

app.get("/SearchForm.html", (req, res) =>
  res.sendFile(path.join(__dirname, "SearchForm.html"))
);

// ----- POST /register -----
/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нового предмета в інвентарі
 *     tags: [Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Назва предмета
 *               description:
 *                 type: string
 *                 description: Опис предмета
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Фото предмета
 *     responses:
 *       201:
 *         description: Предмет успішно створено
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 inventory_name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 photoFilename:
 *                   type: string
 *                 photoUrl:
 *                   type: string
 *       400:
 *         description: Відсутня обов'язкова назва предмета
 */
app.post("/register", upload.single("photo"), async (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name)
    return res.status(400).json({ error: "inventory_name is required" });

  const items = await loadInventory();
  const id = String(Date.now());

  const newItem = {
    id,
    inventory_name,
    description: description || "",
    photoFilename: req.file ? req.file.filename : null,
    photoUrl: req.file ? `/inventory/${id}/photo` : null,
  };

  items.push(newItem);
  await saveInventory(items);
  res.status(201).json(newItem);
});

// ----- GET /inventory -----
/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати список всіх предметів
 *     tags: [Inventory]
 *     responses:
 *       200:
 *         description: Список предметів
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   inventory_name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   photoFilename:
 *                     type: string
 *                   photoUrl:
 *                     type: string
 */
app.get("/inventory", async (req, res) => {
  const items = await loadInventory();
  res.json(items);
});

// ----- GET /inventory/:id -----
/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати інформацію про конкретний предмет
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID предмета
 *     responses:
 *       200:
 *         description: Інформація про предмет
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 inventory_name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 photoFilename:
 *                   type: string
 *                 photoUrl:
 *                   type: string
 *       404:
 *         description: Предмет не знайдено
 */
app.get("/inventory/:id", async (req, res) => {
  const items = await loadInventory();
  const item = findItem(items, req.params.id);

  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

// ----- PUT /inventory/:id -----
/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновити інформацію про предмет
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID предмета
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Предмет оновлено
 *       404:
 *         description: Предмет не знайдено
 */
app.put("/inventory/:id", async (req, res) => {
  const items = await loadInventory();
  const item = findItem(items, req.params.id);

  if (!item) return res.status(404).json({ error: "Item not found" });

  const { inventory_name, description } = req.body;

  if (inventory_name) item.inventory_name = inventory_name;
  if (description !== undefined) item.description = description;

  await saveInventory(items);
  res.json(item);
});

// ----- DELETE /inventory/:id -----
/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити предмет
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID предмета
 *     responses:
 *       200:
 *         description: Предмет видалено
 *       404:
 *         description: Предмет не знайдено
 */
app.delete("/inventory/:id", async (req, res) => {
  const items = await loadInventory();
  const index = items.findIndex((it) => it.id === req.params.id);

  if (index === -1) return res.status(404).json({ error: "Item not found" });

  const [deleted] = items.splice(index, 1);

  if (deleted.photoFilename) {
    const p = path.join(CACHE_DIR, deleted.photoFilename);
    if (fs.existsSync(p)) await fsp.unlink(p);
  }

  await saveInventory(items);
  res.json({ message: "Deleted", id: req.params.id });
});

// ----- GET /inventory/:id/photo -----
/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото предмета
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID предмета
 *     responses:
 *       200:
 *         description: Фото предмета
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Фото не знайдено
 */
app.get("/inventory/:id/photo", async (req, res) => {
  const items = await loadInventory();
  const item = findItem(items, req.params.id);

  if (!item?.photoFilename)
    return res.status(404).json({ error: "Photo not found" });

  const photoPath = path.join(CACHE_DIR, item.photoFilename);

  if (!fs.existsSync(photoPath))
    return res.status(404).json({ error: "Photo file missing" });

  res.sendFile(photoPath);
});

// ----- PUT /inventory/:id/photo -----
/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновити фото предмета
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID предмета
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       400:
 *         description: Фото не завантажено
 *       404:
 *         description: Предмет не знайдено
 */
app.put("/inventory/:id/photo", upload.single("photo"), async (req, res) => {
  const items = await loadInventory();
  const item = findItem(items, req.params.id);

  if (!item) return res.status(404).json({ error: "Item not found" });

  if (!req.file)
    return res.status(400).json({ error: "No photo uploaded" });

  // видалити старе фото
  if (item.photoFilename) {
    const old = path.join(CACHE_DIR, item.photoFilename);
    if (fs.existsSync(old)) await fsp.unlink(old);
  }

  item.photoFilename = req.file.filename;
  item.photoUrl = `/inventory/${item.id}/photo`;

  await saveInventory(items);
  res.json(item);
});

// ----- POST /search -----
/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук предметів за запитом
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Пошуковий запит
 *     responses:
 *       200:
 *         description: Результати пошуку (HTML)
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.post("/search", async (req, res) => {
  const { query } = req.body;

  if (!query) return res.send("No query provided");

  const items = await loadInventory();
  const results = items.filter(
    (i) =>
      i.inventory_name.toLowerCase().includes(query.toLowerCase()) ||
      i.description.toLowerCase().includes(query.toLowerCase())
  );

  if (results.length === 0) return res.send("Item not found");

  let html = "<h1>Search Results</h1>";

  for (const item of results) {
    html += `<p><b>${item.inventory_name}</b> — ${item.description}</p>`;
    if (item.photoUrl) {
      html += `<img src="${item.photoUrl}" width="150"><br>`;
    }
  }

  res.send(html);
});

// ----- 404 -----
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// ----- HTTP Server -----
http.createServer(app).listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Swagger documentation: http://${HOST}:${PORT}/docs`);
});