const express = require("express");
const fs = require("fs");
const https = require("https");
const app = express();

const dotenv = require("dotenv");
dotenv.config();

app.use("/public", express.static("public"));
app.use(express.json());
app.set("view engine", "ejs");

const { auth, requiresAuth } = require("express-openid-connect");
const port = process.env.PORT || 3000;

const data = [];

app.use(
  auth({
    authRequired: false,
    idpLogout: true,
    secret: process.env.SECRET,
    baseURL: `${process.env.BASE_URL}:${port}`,
    clientID: process.env.CLIENT_ID,
    issuerBaseURL: process.env.AUTH0_DOMAIN,
    clientSecret: process.env.CLIENT_SECRET,
    authorizationParams: {
      response_type: "code",
    },
  })
);

app.use((req, res, next) => {
  req.user = { isAuthenticated: req.oidc.isAuthenticated() };
  if (req.user.isAuthenticated) {
    req.user.name = req.oidc.user.name;
  }

  next();
});

app.post("/save", requiresAuth(), (req, res) => {
  if (data.every((entry) => entry.sub !== req.oidc.user.sub)) {
    data.push({ ...req.body, ...req.oidc.user });
  }

  res.json(data);
});

app.get("/", (req, res) => {
  if (
    req.user.isAuthenticated &&
    (Object.keys(data).length === 0 ||
      data.every((entry) => entry.sub !== req.oidc.user.sub))
  ) {
    return res.redirect("/get-location");
  }

  res.render("index", {
    user: req.user,
    ...(req.user.isAuthenticated
      ? {
          data: JSON.stringify([
            {
              ...data.find((d) => d.sub === req.oidc.user.sub),
              current: true,
            },
            ...data
              .slice()
              .filter((d) => d.sub !== req.oidc.user.sub)
              .reverse()
              .slice(0, 4),
          ]),
          center: data[0],
        }
      : {}),
  });
});

app.get("/get-location", requiresAuth(), (req, res) => {
  res.render("getLocation", { user: req.user });
});

app.get("/sign-up", (req, res) => {
  res.oidc.login({
    returnTo: "/",
    authorizationParams: {
      screen_hint: "signup",
    },
  });
});

app.all("*", (req, res) => {
  res.status(404).send("404");
});

const startServer = (server) => {
  server.listen(port, () => {
    console.log(`Server running at ${process.env.BASE_URL}:${port}`);
  });
};

if (process.env.NODE_ENV === "production") {
  startServer(app);
} else {
  const cert = {
    key: fs.readFileSync("server.key"),
    cert: fs.readFileSync("server.cert"),
  };
  startServer(https.createServer(cert, app));
}
