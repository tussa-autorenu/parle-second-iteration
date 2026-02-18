import http from "node:http";
const port = Number(process.env.PORT || 9090);

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = req.url || "";
  if (req.method === "GET" && url.includes("/fleet/vehicles/") && url.endsWith("/status")) {
    return json(res, 200, {
      battery_percent: 80,
      online_status: "awake",
      lock_state: "locked",
      last_location: { lat: 38.25, lng: -85.76 }
    });
  }
  if (req.method === "POST" && url.includes("/commands/")) {
    return json(res, 200, { result: true, command: url.split("/").pop() });
  }
  json(res, 404, { error: "not found" });
});

server.listen(port, () => console.log(`Tesla mock listening on :${port}`));
