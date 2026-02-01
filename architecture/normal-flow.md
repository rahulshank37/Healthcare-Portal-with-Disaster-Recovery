- The backend is considered **healthy** only when it returns:
- HTTP status code `200–399`
- Unhealthy backends are automatically removed from rotation.

---

### 5. Azure App Service (Backend)
- The backend is hosted on **Azure App Service (Linux)**.
- The application runs on **Node.js (Express)**.
- Responsibilities of the backend:
- Serve static application content (`index.html`)
- Expose `/health` endpoint for monitoring
- Respond to application requests

---

### 6. Response to Client
- The backend response is returned to Application Gateway.
- Application Gateway forwards the response back to the client over HTTPS.

---

## Monitoring and Observability

- Application Gateway logs:
- Access logs
- Performance metrics
- WAF logs
- Application health is continuously monitored using:
- Health probes
- Azure Monitor alerts (when configured)
- Logs can be forwarded to **Log Analytics** for analysis.

---

## Key Design Principles

- **Security-First**: All traffic is inspected by WAF.
- **Health-Based Routing**: Only healthy backends receive traffic.
- **Minimal Application Layer**: Focus on infrastructure reliability.
- **Scalability Ready**: Backend can scale without architectural changes.

---

## Normal State Summary

- Application Gateway is operational.
- Backend App Service is healthy.
- Health probes succeed.
- Users experience uninterrupted service.

This workflow represents the **baseline operational state** of the system.
Any deviation from this state triggers investigation or disaster recovery
procedures.
