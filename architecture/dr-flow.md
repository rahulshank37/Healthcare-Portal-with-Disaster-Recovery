Primary Region Failure
(App Service / Region Down)
          ❌
           |
           v
┌──────────────────────────┐
│ Application Gateway (PR) │
│ Health Probe Fails       │
└────────────┬─────────────┘
             │
             v
┌──────────────────────────┐
│ DNS / Traffic Manager    │
│ (Manual or Automatic)    │
└────────────┬─────────────┘
             │
             v
┌──────────────────────────┐
│ Application Gateway (DR) │
│ WAF v2 (Same Policy)     │
└────────────┬─────────────┘
             │ HTTPS (443)
             v
┌──────────────────────────┐
│ App Service (DR Region)  │
│ Node.js Backend          │
└────────────┬─────────────┘
             │
             v
┌──────────────────────────┐
│ Azure SQL Failover Group │
│ Secondary → Primary     │
└──────────────────────────┘

