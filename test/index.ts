import App from "../src/App";

const app = new App();

app.use(async req => {
  if (req.url === "/favicon.ico") {
    req.statusCode = 404;
  }
});

app.use(async _req => {
  //console.log(`Resource requested: ${req.url}`);
});

app.get("/", async () => {
  throw new Error("fg")
  return "Hiya!";
});

app.use("/", async (_req, _res, err) => {
  console.log("Shite err")
  console.error(err)
  return "Hiya!";
});

app.get("/err", async () => {
  throw new Error("fgfdf")
  return "Hiya!";
});

app.use("/err", async (_req, _res, err) => {
  console.log("/err Shite err")
  throw new Error("the test")
  console.error(err)
  return "Hiya!";
});

app.start(8080)
  .then(() => {
    console.log("Server now listening on port 8080!");
  })
  .catch(console.error);