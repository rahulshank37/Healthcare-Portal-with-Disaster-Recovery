# Standard Operating Procedure (SOP)
## Healthcare Call Center Portal with Disaster Recovery - HIPAA Compliant Infrastructure

**Project Name:** Healthcare Call Center Portal with Disaster Recovery  
**Project Code:** HCC-DR-001  
**Version:** 1.0  
**Last Updated:** January 30, 2026  
**Document Owner:** Infrastructure Team  
**Compliance Framework:** HIPAA Technical Safeguards, FDA 21 CFR Part 11

---

## 1. PROJECT OVERVIEW

### 1.1 Purpose
This SOP outlines the procedures for deploying and maintaining a HIPAA-compliant healthcare call center portal with full disaster recovery capabilities using Azure infrastructure. The system is designed for 24/7 mission-critical operations supporting adverse event reporting, patient safety inquiries, and medical information services across multiple regions with automatic failover.

### 1.2 Scope
This document covers:
- Multi-region Azure infrastructure (Primary + DR)
- Application Gateway with WAF v2 in both regions
- Azure Traffic Manager for intelligent routing
- Network security implementation with public internet access
- Authentication and authorization setup for call center agents
- SSL/TLS certificate management across regions
- Database geo-replication and failover
- Comprehensive audit logging and monitoring
- Disaster recovery procedures and testing

### 1.3 Healthcare Call Center Context
**Use Case:** Pharmaceutical safety reporting (adverse drug events), hospital call centers, poison control centers, medical information services  
**End Users:** Call center agents, medical information specialists, pharmacovigilance professionals, supervisors  
**Workload:** 200-500 concurrent agents, 24/7 operations, peak volumes during business hours and emergency situations  
**Compliance Requirements:** HIPAA Privacy Rule, HIPAA Security Rule, FDA 21 CFR Part 11, SOC 2 Type II  
**SLA Target:** 99.95% uptime (maximum 4.38 hours downtime per year)

### 1.4 Architecture Overview - Multi-Region with DR

```
                                    Internet
                                        ↓
                            Azure Traffic Manager
                        (Priority Routing + Health Checks)
                                        ↓
                    ┌───────────────────┴────────────────────┐
                    ↓                                        ↓
        PRIMARY REGION (East US 2)              DR REGION (West US 2)
                    ↓                                        ↓
        Application Gateway (WAF v2)            Application Gateway (WAF v2)
        pip-appgw-hcc-prod-eus2                pip-appgw-hcc-dr-wus2
                    ↓                                        ↓
        Web App (Public Access)                 Web App (Standby/Active)
        app-hcc-prod-eus2                      app-hcc-dr-wus2
                    ↓                                        ↓
            Azure AD (Global SSO)                   Azure AD (Global SSO)
                    ↓                                        ↓
    ┌───────────────┴────────────────┐      ┌───────────────┴────────────────┐
    ↓               ↓                ↓      ↓               ↓                ↓
SQL Primary    Redis Primary    Storage   SQL Secondary  Redis DR      Storage DR
(Auto-Failover Group)            (GRS)    (Read Replica)  (Standby)     (GRS replica)
    ↓               ↓                ↓      ↓               ↓                ↓
        Log Analytics Workspace (Global)
        Application Insights (Multi-region)
```

**Key Design Decisions:**
- **Active-Passive DR:** Primary serves all traffic unless failure detected
- **Database:** SQL Auto-Failover Groups with automatic failover
- **Storage:** Geo-Redundant Storage (GRS) with read access in DR region
- **Cache:** Redis Premium with geo-replication
- **RTO (Recovery Time Objective):** 15 minutes
- **RPO (Recovery Point Objective):** 5 minutes

---

## 2. PRE-DEPLOYMENT REQUIREMENTS

### 2.1 Azure Subscription Requirements
- Active Azure subscription with Owner or Contributor access
- Sufficient quota for multi-region deployment:
  - Application Gateway WAF v2: 2 instances per region
  - Premium App Service Plan: 20 instances per region
  - SQL Database: 8 vCores per region
  - Redis Premium: P2 tier per region
- Resource providers registered:
  - Microsoft.Network
  - Microsoft.Web
  - Microsoft.AzureActiveDirectory
  - Microsoft.Storage
  - Microsoft.Sql
  - Microsoft.KeyVault
  - Microsoft.Insights
  - Microsoft.Cache
  - Microsoft.Cdn (for Traffic Manager)

### 2.2 Compliance Prerequisites
- HIPAA Business Associate Agreement (BAA) signed with Microsoft Azure
- Security risk assessment completed and documented
- Data classification completed (PHI identified)
- Incident response plan established
- Disaster recovery plan documented
- Business continuity plan approved
- Agent background checks completed
- HIPAA training completed for all personnel
- FDA 21 CFR Part 11 compliance review (if applicable)

### 2.3 Third-Party Integrations
- **Telephony System:** Twilio, Azure Communication Services, or existing PBX
- **CRM System:** Salesforce, Microsoft Dynamics 365, or custom CRM
- **Ticketing System:** ServiceNow, Zendesk, Jira Service Management
- **Payment Gateway:** Stripe, Square (PCI-DSS compliant)
- **Email Service:** SendGrid, Twilio SendGrid
- **SMS Service:** Twilio, Azure Communication Services

### 2.4 Required Tools
- Azure Portal access
- Azure CLI (version 2.50+) or Azure PowerShell
- SSL certificates from trusted CA (DigiCert, Sectigo, or Let's Encrypt)
- Text editor / IDE (VS Code recommended)
- Git for version control
- Terraform or Bicep (optional, for Infrastructure as Code)

### 2.5 Permissions Required
- Azure AD Global Administrator (for tenant-wide SSO setup)
- Subscription Owner or Contributor (both regions)
- Network Contributor
- DNS Zone Contributor (for custom domains)

### 2.6 Region Selection Rationale

**Primary Region: East US 2**
- Low latency for East Coast US operations
- Availability Zones support
- Full service availability
- Cost-effective

**DR Region: West US 2**
- Azure paired region with East US 2
- Geographic separation (disaster isolation)
- Data residency compliance
- Same service availability as primary

---

## 3. PRIMARY REGION DEPLOYMENT (EAST US 2)

### 3.1 Resource Group Creation

**Procedure:**
1. Log into Azure Portal (https://portal.azure.com)
2. Navigate to Resource Groups
3. Click "+ Create"
4. Configure PRIMARY resource group:
   - **Subscription:** [Your Subscription]
   - **Resource Group Name:** `rg-hcc-prod-eus2`
   - **Region:** East US 2
   - **Tags:**
     - Environment: Production
     - Project: HealthcareCallCenter
     - Region: Primary
     - Compliance: HIPAA
     - CostCenter: [Your Cost Center]
     - DR-Pair: rg-hcc-dr-wus2
5. Click "Review + Create" → "Create"

**Validation:** Resource group visible in portal

---

### 3.2 Virtual Network (Primary Region)

**Purpose:** Isolate backend resources while allowing public web app access

**Procedure:**

#### 3.2.1 Create Primary VNet
1. Navigate to "Virtual Networks" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - Name: `vnet-hcc-prod-eus2`
   - Region: East US 2
3. **IP Addresses:**
   - Address space: `10.21.0.0/16`
   - Subnets:
     - **AppGatewaySubnet:** `10.21.1.0/24` (Application Gateway)
     - **WebAppSubnet:** `10.21.2.0/24` (VNet integration for Web App)
     - **DatabaseSubnet:** `10.21.3.0/24` (SQL private endpoint)
     - **CacheSubnet:** `10.21.4.0/24` (Redis private endpoint)
     - **PrivateEndpointSubnet:** `10.21.5.0/24` (Storage, Key Vault)
     - **BastionSubnet:** `10.21.6.0/27` (Azure Bastion for admin access)
4. **Security:**
   - BastionHost: Enabled (create `bastion-hcc-prod-eus2`)
   - DDoS Protection: Standard (critical for public-facing)
   - Firewall: Optional (budget permitting)
5. **Tags:** Same as resource group
6. Click "Review + Create" → "Create"

#### 3.2.2 Configure Network Security Groups

**NSG for AppGatewaySubnet:**
```
Name: nsg-appgw-hcc-prod-eus2

Inbound Rules:
Priority 100: Allow HTTPS (443) from Internet (0.0.0.0/0)
Priority 110: Allow HTTP (80) from Internet (for redirect to HTTPS)
Priority 120: Allow GatewayManager (65200-65535) from GatewayManager
Priority 130: Allow AzureLoadBalancer from AzureLoadBalancer
Priority 4096: Deny All

Outbound Rules:
Priority 100: Allow HTTPS (443) to 10.21.2.0/24 (Web App subnet)
Priority 110: Allow Internet (for updates, health probes)
Priority 4096: Deny All
```

**NSG for WebAppSubnet:**
```
Name: nsg-webapp-hcc-prod-eus2

Inbound Rules:
Priority 100: Allow HTTPS (443) from 10.21.1.0/24 (App Gateway)
Priority 110: Allow HTTPS (443) from Internet (direct access if needed)
Priority 4096: Deny All

Outbound Rules:
Priority 100: Allow HTTPS (443) to Internet (APIs, integrations)
Priority 110: Allow SQL (1433) to 10.21.3.0/24
Priority 120: Allow Redis (6379-6380) to 10.21.4.0/24
Priority 130: Allow HTTPS (443) to 10.21.5.0/24 (Storage, Key Vault)
Priority 4096: Deny All
```

**Validation:** NSGs created and attached to subnets

---

### 3.3 Azure Key Vault (Primary Region)

**Purpose:** Store certificates, secrets, and keys for primary region

**Procedure:**
1. Navigate to "Key Vaults" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - Key Vault Name: `kv-hcc-prod-eus2` (globally unique)
   - Region: East US 2
   - Pricing Tier: Premium (HSM-backed keys for high security)
3. **Access Configuration:**
   - Permission Model: Azure RBAC
   - Enable RBAC: Yes
4. **Networking:**
   - Public endpoint: Enabled (for App Gateway access)
   - Firewall: Selected networks
     - Add Application Gateway subnet
     - Add your admin IPs
   - Allow trusted Microsoft services: Yes
5. **Data Protection:**
   - Enable soft delete: Yes (90 days)
   - Enable purge protection: Yes
6. **Disaster Recovery:**
   - Automatic replication: Yes (Azure handles this)
7. **Tags:** Same as resource group
8. Click "Review + Create" → "Create"

**Post-Deployment:**
1. Upload SSL certificate for primary domain
2. Create secrets for:
   - Database connection strings
   - Redis connection string
   - Twilio API credentials
   - CRM API keys
   - SendGrid API key
   - Application Insights instrumentation key

**Validation:** Key Vault accessible, secrets stored

---

### 3.4 Application Gateway (Primary Region)

**Purpose:** Regional load balancer, WAF, SSL termination

**Procedure:**

#### 3.4.1 Create WAF Policy (Primary)
1. Navigate to "Web Application Firewall policies" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - Policy name: `waf-hcc-prod-eus2`
   - Region: East US 2
   - Policy tier: WAF_v2
3. **Policy Settings:**
   - State: Enabled
   - Mode: Prevention
4. **Managed Rules:**
   - Rule Set: OWASP 3.2 (Microsoft Default)
   - Bot Protection: Enabled
5. **Custom Rules:**
   - **Rule 1: Rate Limiting**
     - Name: RateLimitAgents
     - Priority: 1
     - Type: Rate limit
     - Match condition: All requests
     - Rate limit threshold: 500 requests per 1 minute
     - Action: Block
   - **Rule 2: Geo-Restriction (Optional)**
     - Name: AllowUSOnly
     - Priority: 2
     - Type: Match
     - Match condition: Geo location NOT in US
     - Action: Block (if agents US-based only)
   - **Rule 3: Known Bad IPs**
     - Name: BlockMaliciousIPs
     - Priority: 3
     - Type: Match
     - Match condition: IP address in [threat intelligence list]
     - Action: Block
6. Save policy

#### 3.4.2 Create Application Gateway (Primary)
1. Navigate to "Application Gateways" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - Name: `agw-hcc-prod-eus2`
   - Region: East US 2
   - Tier: WAF_v2
   - Enable autoscaling: Yes
   - Minimum instance count: 2
   - Maximum instance count: 20
   - Availability zones: 1, 2, 3 (zone-redundant)
3. **Frontends:**
   - Frontend IP type: Public
   - Public IP address: Create new
     - Name: `pip-appgw-hcc-prod-eus2`
     - SKU: Standard
     - Tier: Regional
     - Assignment: Static
     - Availability zone: Zone-redundant
4. **Backends:**
   - Backend pool name: `pool-webapp-hcc-prod`
   - Target type: App Services
   - Target: [Will add after Web App creation]
5. **Configuration - Routing Rule:**
   - Rule name: `rule-https-hcc-prod`
   - Priority: 100
   - **Listener:**
     - Name: `listener-https-443`
     - Frontend IP: Public
     - Protocol: HTTPS
     - Port: 443
     - Listener type: Multi-site
     - Host name: `agents.healthcarecallcenter.com`
     - SSL certificate: Choose from Key Vault
       - Managed identity: Create new
       - Key Vault: `kv-hcc-prod-eus2`
       - Certificate: `ssl-hcc-prod`
     - Custom error pages: Configure 502, 403 error pages
   - **Backend targets:**
     - Target type: Backend pool
     - Backend pool: `pool-webapp-hcc-prod`
     - Backend settings: Create new
       - Name: `settings-https-hcc-prod`
       - Backend protocol: HTTPS
       - Backend port: 443
       - Cookie-based affinity: Enabled (critical for sessions)
       - Connection draining: Enabled (180 seconds)
       - Request timeout: 60 seconds
       - Override hostname: Pick hostname from backend target
       - Create custom probe: Yes
6. **Health Probe:**
   - Name: `probe-webapp-hcc-prod`
   - Protocol: HTTPS
   - Pick hostname from backend settings: Yes
   - Path: `/health` (application health endpoint)
   - Interval: 30 seconds
   - Timeout: 30 seconds
   - Unhealthy threshold: 3
   - Status code: 200-399
7. **HTTP to HTTPS Redirect:**
   - Create listener on port 80
   - Name: `listener-http-80`
   - Create redirect configuration
   - Redirect type: Permanent
   - Redirect target: `listener-https-443`
8. **WAF:**
   - Firewall policy: `waf-hcc-prod-eus2`
9. **Tags:** Same as resource group
10. Click "Review + Create" → "Create"

**Deployment Time:** 15-30 minutes

**Post-Deployment Configuration:**
1. Enable diagnostic settings → Log Analytics
2. Configure alert rules:
   - Unhealthy host count > 0
   - Failed requests > 100 in 5 minutes
   - Backend response time > 5 seconds
3. Test health probe

**Validation:** Application Gateway running, public IP assigned, WAF active

---

### 3.5 App Service Plan & Web App (Primary)

**Purpose:** Host the call center agent portal application

#### 3.5.1 Create App Service Plan (Primary)
1. Navigate to "App Service Plans" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - Name: `asp-hcc-prod-eus2`
   - Operating System: Linux
   - Region: East US 2
   - Pricing Tier: Premium V3 P2v3
     - 2 vCPU, 8 GB RAM
     - Supports up to 20 instances
3. **Zone Redundancy:** Enabled
4. Click "Review + Create" → "Create"

#### 3.5.2 Create Web App (Primary)
1. Navigate to "App Services" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - Name: `app-hcc-prod-eus2` (globally unique)
   - Publish: Code
   - Runtime Stack: Node 18 LTS / .NET 8 / Python 3.11
   - Operating System: Linux
   - Region: East US 2
   - App Service Plan: `asp-hcc-prod-eus2`
3. **Deployment:**
   - Continuous deployment: Enable
   - GitHub Actions: Configure later
4. **Networking:**
   - Enable public access: Yes
   - Enable VNet integration: Yes
   - Virtual Network: `vnet-hcc-prod-eus2`
   - Subnet: WebAppSubnet
5. **Monitoring:**
   - Enable Application Insights: Yes
   - Application Insights: Create new
     - Name: `appi-hcc-prod-eus2`
     - Region: East US 2
6. **Tags:** Same as resource group
7. Click "Review + Create" → "Create"

#### 3.5.3 Configure Web App Settings
1. Navigate to Web App → Configuration → Application Settings
2. Add settings:
```
# General
WEBSITES_PORT=8080
WEBSITE_VNET_ROUTE_ALL=1
NODE_ENV=production

# Database (will be auto-failover group endpoint)
DB_SERVER=@Microsoft.KeyVault(SecretUri=https://kv-hcc-prod-eus2.vault.azure.net/secrets/db-server/)
DB_NAME=@Microsoft.KeyVault(SecretUri=https://kv-hcc-prod-eus2.vault.azure.net/secrets/db-name/)
DB_USER=@Microsoft.KeyVault(SecretUri=https://kv-hcc-prod-eus2.vault.azure.net/secrets/db-user/)
DB_PASSWORD=@Microsoft.KeyVault(SecretUri=https://kv-hcc-prod-eus2.vault.azure.net/secrets/db-password/)

# Redis Cache
REDIS_HOST=@Microsoft.KeyVault(SecretUri=https://kv-hcc-prod-eus2.vault.azure.net/secrets/redis-host/)
REDIS_KEY=@Microsoft.KeyVault(SecretUri=https://kv-hcc-prod-eus2.vault.azure.net/secrets/redis-key/)

# Azure AD
AZURE_AD_TENANT_ID=[Tenant ID]
AZURE_AD_CLIENT_ID=[Client ID]
AZURE_AD_CLIENT_SECRET=@Microsoft.KeyVault(...)

# Telephony
TWILIO_ACCOUNT_SID=@Microsoft.KeyVault(...)
TWILIO_AUTH_TOKEN=@Microsoft.KeyVault(...)

# Integrations
CRM_API_URL=https://api.crm.com
CRM_API_KEY=@Microsoft.KeyVault(...)

# Monitoring
APPINSIGHTS_INSTRUMENTATIONKEY=[Auto-populated]
APPLICATIONINSIGHTS_CONNECTION_STRING=[Auto-populated]

# Feature Flags
ENABLE_DR_SYNC=true
REGION=primary
```

3. **TLS/SSL Settings:**
   - HTTPS Only: On
   - Minimum TLS Version: 1.2
   - Client certificate mode: Optional

4. **Authentication:**
   - Add identity provider: Microsoft
   - Configure Azure AD (see Section 3.7)

#### 3.5.4 Configure Autoscaling (Primary)
1. Navigate to App Service Plan → "Scale out"
2. **Autoscale configuration:**
   - Custom autoscale: Enabled
   - **Default Rule:**
     - Minimum instances: 3
     - Maximum instances: 20
     - Default instances: 5
   - **Scale-out Rule:**
     - Metric: CPU Percentage
     - Operator: Greater than
     - Threshold: 70%
     - Duration: 5 minutes
     - Cool down: 5 minutes
     - Action: Increase count by 2
   - **Scale-in Rule:**
     - Metric: CPU Percentage
     - Operator: Less than
     - Threshold: 30%
     - Duration: 10 minutes
     - Cool down: 10 minutes
     - Action: Decrease count by 1
   - **Additional Rule (Request-based):**
     - Metric: HTTP Queue Length
     - Operator: Greater than
     - Threshold: 50
     - Action: Increase count by 3

3. Add to Application Gateway backend pool

**Validation:** Web App accessible via App Gateway, autoscaling configured

---

### 3.6 Azure SQL Database (Primary with Auto-Failover Group)

**Purpose:** Store patient data, call logs, agent information

#### 3.6.1 Create SQL Server (Primary)
1. Navigate to "SQL servers" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - Server name: `sql-hcc-prod-eus2`
   - Location: East US 2
   - Authentication: Use both SQL and Azure AD
   - Set Azure AD admin: [Your admin account]
   - SQL admin: sqladmin
   - Password: [Strong password - store in Key Vault]
3. **Networking:**
   - Connectivity: Public endpoint
   - Firewall rules:
     - Allow Azure services: Yes
     - Add Application Gateway public IP
     - Add your admin IP
   - **Private endpoint (recommended):**
     - Create: Yes
     - Name: `pe-sql-hcc-prod-eus2`
     - Subnet: DatabaseSubnet
4. **Security:**
   - Microsoft Defender for SQL: Yes
   - Ledger: Enabled
   - Auditing: Enable
     - Storage account: Create new `stsqlaudithccprod`
5. **Identity:**
   - System assigned managed identity: On
6. Click "Review + Create" → "Create"

#### 3.6.2 Create SQL Database (Primary)
1. Navigate to SQL Server → Databases → "+ Create database"
2. **Basics:**
   - Database name: `sqldb-hcc-prod`
   - Compute + Storage:
     - Service tier: General Purpose
     - Compute tier: Provisioned
     - Hardware: Standard-series (Gen5)
     - vCores: 4
     - Data max size: 250 GB
   - Backup storage redundancy: Geo-redundant (critical for DR)
3. **Networking:**
   - Connection policy: Default
   - Encrypted connections: Require
4. **Additional settings:**
   - Use existing data: None
   - Collation: SQL_Latin1_General_CP1_CI_AS
   - Enable Advanced Data Security: Yes
5. Click "Review + Create" → "Create"

#### 3.6.3 Configure Database Security
1. **Transparent Data Encryption (TDE):** Verify enabled
2. **Dynamic Data Masking:**
   - Navigate to database → Security → Dynamic Data Masking
   - Add masking rules:
     - SSN column: Full mask (XXX-XX-XXXX)
     - Email: Email mask (aXXX@XXXX.com)
     - Phone: Custom (XXX-XXX-1234)
     - Credit card: Full mask
3. **Row-Level Security:** Implement agent isolation
4. **Always Encrypted:** Configure for sensitive columns
5. **Auditing:** Verify enabled to storage

#### 3.6.4 Deploy Database Schema

**Healthcare Call Center Schema:**

```sql
-- Agents table
CREATE TABLE Agents (
    AgentID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AzureAD_ObjectID NVARCHAR(255) UNIQUE NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    EmployeeID NVARCHAR(50) UNIQUE,
    Role NVARCHAR(50), -- Agent, Supervisor, Manager, Admin
    Team NVARCHAR(100),
    PrimaryLocation NVARCHAR(50), -- EastUS2, WestUS2
    HireDate DATE,
    Status NVARCHAR(20), -- Active, OnBreak, Offline, Terminated
    LastLoginDate DATETIME2,
    LastLoginRegion NVARCHAR(20),
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    ModifiedDate DATETIME2
);

-- Patients table
CREATE TABLE Patients (
    PatientID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    MRN NVARCHAR(50) UNIQUE NOT NULL,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    DateOfBirth DATE,
    SSN NVARCHAR(11), -- Encrypted/Masked
    Email NVARCHAR(255),
    Phone NVARCHAR(20),
    Address NVARCHAR(MAX),
    City NVARCHAR(100),
    State NVARCHAR(2),
    ZipCode NVARCHAR(10),
    InsuranceProvider NVARCHAR(100),
    InsurancePolicyNumber NVARCHAR(100),
    PreferredLanguage NVARCHAR(50),
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    ModifiedDate DATETIME2
);

-- Call Logs table
CREATE TABLE CallLogs (
    CallID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    PatientID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Patients(PatientID),
    AgentID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Agents(AgentID),
    CallStartTime DATETIME2 DEFAULT GETUTCDATE(),
    CallEndTime DATETIME2,
    CallDuration INT, -- Seconds
    CallType NVARCHAR(50), -- Inbound, Outbound
    CallReason NVARCHAR(100), -- Appointment, Billing, Medical Records, Adverse Event, General
    CallStatus NVARCHAR(50), -- Completed, Transferred, Abandoned, Voicemail
    CallerPhoneNumber NVARCHAR(20),
    RecordingURL NVARCHAR(500),
    RecordingRegion NVARCHAR(20), -- Which region stored the recording
    Transcript TEXT,
    Resolution NVARCHAR(MAX),
    FollowUpRequired BIT DEFAULT 0,
    FollowUpDate DATETIME2,
    SatisfactionRating INT, -- 1-5
    CallerIP NVARCHAR(50),
    AgentRegion NVARCHAR(20), -- Which region handled the call
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    ModifiedDate DATETIME2
);

-- Adverse Events table (for pharmacovigilance)
CREATE TABLE AdverseEvents (
    EventID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CallID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES CallLogs(CallID),
    PatientID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Patients(PatientID),
    ReportedByAgentID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Agents(AgentID),
    EventDate DATETIME2,
    DrugName NVARCHAR(200),
    DrugDosage NVARCHAR(100),
    AdverseReaction NVARCHAR(MAX),
    Severity NVARCHAR(50), -- Mild, Moderate, Severe, Life-threatening
    Outcome NVARCHAR(100), -- Recovered, Recovering, Not Recovered, Fatal, Unknown
    ReporterType NVARCHAR(50), -- Patient, Physician, Pharmacist, Other
    FDAReportNumber NVARCHAR(100),
    ReportedToFDA BIT DEFAULT 0,
    ReportDate DATETIME2,
    FollowUpRequired BIT DEFAULT 0,
    Notes NVARCHAR(MAX),
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    ModifiedDate DATETIME2
);

-- Call Notes table
CREATE TABLE CallNotes (
    NoteID BIGINT IDENTITY(1,1) PRIMARY KEY,
    CallID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES CallLogs(CallID),
    AgentID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Agents(AgentID),
    NoteText NVARCHAR(MAX),
    NoteType NVARCHAR(50), -- General, Medical, Billing, Compliance, Escalation
    Timestamp DATETIME2 DEFAULT GETUTCDATE(),
    Region NVARCHAR(20)
);

-- Appointments table
CREATE TABLE Appointments (
    AppointmentID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    PatientID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Patients(PatientID),
    ScheduledByAgentID UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Agents(AgentID),
    AppointmentDate DATETIME2,
    AppointmentType NVARCHAR(100),
    Provider NVARCHAR(100),
    Location NVARCHAR(255),
    Status NVARCHAR(50), -- Scheduled, Confirmed, Cancelled, NoShow, Completed
    ConfirmationSentDate DATETIME2,
    ReminderSentDate DATETIME2,
    Notes NVARCHAR(MAX),
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    ModifiedDate DATETIME2,
    CreatedInRegion NVARCHAR(20)
);

-- Audit Log (HIPAA requirement)
CREATE TABLE AuditLog (
    AuditID BIGINT IDENTITY(1,1) PRIMARY KEY,
    Timestamp DATETIME2 DEFAULT GETUTCDATE(),
    AgentID UNIQUEIDENTIFIER,
    Action NVARCHAR(100),
    ResourceType NVARCHAR(50),
    ResourceID NVARCHAR(255),
    PatientID UNIQUEIDENTIFIER,
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(500),
    SessionID NVARCHAR(255),
    Region NVARCHAR(20),
    StatusCode INT,
    Details NVARCHAR(MAX),
    -- Geo-replication tracking
    ReplicatedToDR BIT DEFAULT 0,
    ReplicationTimestamp DATETIME2
);

-- DR Sync Status table (track replication health)
CREATE TABLE DRSyncStatus (
    SyncID BIGINT IDENTITY(1,1) PRIMARY KEY,
    TableName NVARCHAR(100),
    LastSyncTime DATETIME2,
    RecordsSynced BIGINT,
    SyncStatus NVARCHAR(50), -- Success, Failed, InProgress
    ErrorMessage NVARCHAR(MAX),
    PrimaryRegion NVARCHAR(20),
    SecondaryRegion NVARCHAR(20)
);

-- Create indexes
CREATE INDEX IX_Agents_AzureAD ON Agents(AzureAD_ObjectID);
CREATE INDEX IX_Agents_Email ON Agents(Email);
CREATE INDEX IX_Patients_MRN ON Patients(MRN);
CREATE INDEX IX_CallLogs_Patient ON CallLogs(PatientID);
CREATE INDEX IX_CallLogs_Agent ON CallLogs(AgentID);
CREATE INDEX IX_CallLogs_StartTime ON CallLogs(CallStartTime DESC);
CREATE INDEX IX_AdverseEvents_Patient ON AdverseEvents(PatientID);
CREATE INDEX IX_AdverseEvents_Drug ON AdverseEvents(DrugName);
CREATE INDEX IX_Appointments_Patient ON Appointments(PatientID);
CREATE INDEX IX_Appointments_Date ON Appointments(AppointmentDate);
CREATE INDEX IX_AuditLog_Timestamp ON AuditLog(Timestamp DESC);
CREATE INDEX IX_AuditLog_Agent ON AuditLog(AgentID);
CREATE INDEX IX_AuditLog_Patient ON AuditLog(PatientID);
CREATE INDEX IX_AuditLog_Region ON AuditLog(Region);

-- Row-Level Security for agent isolation
CREATE SCHEMA Security;
GO

CREATE FUNCTION Security.fn_AgentAccessPredicate(@AgentID UNIQUEIDENTIFIER)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS fn_securitypredicate_result
WHERE @AgentID = CAST(SESSION_CONTEXT(N'AgentID') AS UNIQUEIDENTIFIER)
   OR IS_MEMBER('db_owner') = 1
   OR IS_MEMBER('Supervisors') = 1;
GO

CREATE SECURITY POLICY Security.AgentCallLogPolicy
ADD FILTER PREDICATE Security.fn_AgentAccessPredicate(AgentID)
ON dbo.CallLogs
WITH (STATE = ON);
GO
```

**Validation:** Schema deployed, RLS working, data masking active

---

### 3.7 Azure Cache for Redis (Primary with Geo-Replication)

**Purpose:** Session management, real-time agent status, caching

#### 3.7.1 Create Redis Cache (Primary)
1. Navigate to "Azure Cache for Redis" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - DNS name: `redis-hcc-prod-eus2`
   - Location: East US 2
   - Cache type: Premium P2 (6 GB, supports geo-replication)
   - Clustering: Disabled initially
3. **Networking:**
   - Connectivity: Private endpoint
   - Virtual network: `vnet-hcc-prod-eus2`
   - Subnet: CacheSubnet
   - Private endpoint: `pe-redis-hcc-prod-eus2`
4. **Advanced:**
   - Non-SSL port: Disabled
   - TLS version: 1.2
   - Data persistence: RDB (hourly snapshots)
   - Backup: Enabled
     - Storage account: Create `stredisbackuphccprod`
     - Backup frequency: 60 minutes
5. **Tags:** Same as resource group
6. Click "Review + Create" → "Create"

**Deployment time:** 20-30 minutes

#### 3.7.2 Use Cases
- Agent session state
- Active call tracking
- Real-time agent status board
- Call queue management
- Rate limiting
- Frequently accessed patient data cache

**Note:** Geo-replication will be configured after DR Redis is deployed

**Validation:** Redis accessible from Web App

---

### 3.8 Storage Account (Primary with GRS)

**Purpose:** Call recordings, documents, audit logs

#### 3.8.1 Create Storage Account (Primary)
1. Navigate to "Storage accounts" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2`
   - Storage account name: `sthccprodeus2` (globally unique)
   - Region: East US 2
   - Performance: Standard
   - Redundancy: **GRS (Geo-redundant storage)**
     - Enable read access: Yes (RA-GRS)
3. **Advanced:**
   - Secure transfer: Required
   - Blob public access: Disabled
   - Storage account key access: Enabled
   - Minimum TLS: 1.2
   - Infrastructure encryption: Enabled
4. **Networking:**
   - Network access: Enabled from selected networks
   - Virtual networks: Add `vnet-hcc-prod-eus2` → WebAppSubnet
   - Private endpoint: Create
     - Name: `pe-storage-hcc-prod-eus2`
     - Subnet: PrivateEndpointSubnet
   - Allow trusted Microsoft services: Yes
5. **Data protection:**
   - Point-in-time restore: 30 days
   - Soft delete (blobs): 90 days
   - Soft delete (containers): 90 days
   - Versioning: Enabled
6. **Encryption:**
   - Microsoft-managed keys
7. Click "Review + Create" → "Create"

#### 3.8.2 Create Blob Containers
1. Navigate to Storage → Containers
2. Create:
   - `call-recordings-eus2` (Private)
   - `call-transcripts-eus2` (Private)
   - `agent-documents` (Private)
   - `audit-logs-eus2` (Private)
   - `compliance-reports` (Private)
   - `dr-sync-checkpoints` (Private) - Track replication status
3. Configure lifecycle:
   - Call recordings: Cool after 90 days, Archive after 365 days
   - Audit logs: Archive after 365 days, Delete after 7 years

**Validation:** GRS replication active, data accessible in DR region (read-only)

---

### 3.9 Azure AD Configuration (Global - Single Tenant)

**Purpose:** SSO for agents across all regions

#### 3.9.1 Create App Registration
1. Navigate to Azure AD → App registrations → "+ New registration"
2. **Register:**
   - Name: Healthcare Call Center Portal
   - Supported accounts: Single tenant
   - Redirect URI:
     - Platform: Web
     - URI: `https://agents.healthcarecallcenter.com/auth/callback`
     - Add: `https://app-hcc-prod-eus2.azurewebsites.net/auth/callback`
     - Add: `https://app-hcc-dr-wus2.azurewebsites.net/auth/callback` (DR)
3. Note: Application (client) ID, Directory (tenant) ID
4. Create client secret → Store in both Key Vaults

#### 3.9.2 Configure API Permissions
- Microsoft Graph:
  - User.Read
  - User.ReadBasic.All
  - Group.Read.All
- Grant admin consent

#### 3.9.3 Configure Conditional Access
1. Azure AD → Security → Conditional Access
2. Create policy: "Call Center Portal - MFA Required"
   - Users: All call center users
   - Cloud apps: Healthcare Call Center Portal
   - Grant controls: Require MFA
3. Enable policy

**Validation:** SSO works from both regions

---

### 3.10 Log Analytics & Monitoring (Global)

**Purpose:** Centralized logging across regions

#### 3.10.1 Create Log Analytics Workspace
1. Navigate to "Log Analytics workspaces" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2` (or separate monitoring RG)
   - Name: `log-hcc-global`
   - Region: East US 2 (primary, but collects from all regions)
   - Pricing: Pay-as-you-go
3. **Data retention:** 730 days (2 years for compliance)
4. Click "Review + Create" → "Create"

#### 3.10.2 Enable Diagnostics (All Primary Resources)
For each resource, enable diagnostic settings → Send to `log-hcc-global`

#### 3.10.3 Create Alert Rules (Multi-Region Aware)

**Critical Alerts:**

1. **Primary Region Outage:**
```
Query: Heartbeat
| where Computer contains "eus2"
| summarize LastHeartbeat=max(TimeGenerated) by Computer
| where LastHeartbeat < ago(5m)
```
Action: Trigger failover to DR, page on-call

2. **Database Failover Event:**
```
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.SQL"
| where Category == "AutomaticFailover"
```
Action: Email DBA, update status page

3. **Failed Logins (Security):**
```
SigninLogs
| where ResultType != 0
| summarize FailedAttempts=count() by UserPrincipalName, IPAddress
| where FailedAttempts > 5
```
Action: Lock account, email security

**Validation:** Logs flowing from all resources

---

## 4. DR REGION DEPLOYMENT (WEST US 2)

### 4.1 DR Resource Group

Create resource group for DR:
- Name: `rg-hcc-dr-wus2`
- Region: West US 2
- Tags: Environment=DR, Region=Secondary, DR-Pair=rg-hcc-prod-eus2

---

### 4.2 DR Virtual Network

**Procedure:**
1. Create VNet in West US 2:
   - Name: `vnet-hcc-dr-wus2`
   - Address space: `10.22.0.0/16` (different from primary)
   - Subnets: Same structure as primary
     - AppGatewaySubnet: `10.22.1.0/24`
     - WebAppSubnet: `10.22.2.0/24`
     - DatabaseSubnet: `10.22.3.0/24`
     - CacheSubnet: `10.22.4.0/24`
     - PrivateEndpointSubnet: `10.22.5.0/24`
     - BastionSubnet: `10.22.6.0/27`
2. Create NSGs (mirror primary configuration)
3. Configure VNet Peering (optional, if cross-region communication needed)

**Validation:** DR VNet operational

---

### 4.3 DR Key Vault

Create Key Vault in DR region:
- Name: `kv-hcc-dr-wus2`
- Region: West US 2
- Configuration: Mirror primary Key Vault
- Secrets: Replicate from primary (use automation)
- SSL Certificate: Upload same certificate

**Validation:** Key Vault accessible in DR region

---

### 4.4 DR Application Gateway

**Procedure:**
1. Create WAF Policy: `waf-hcc-dr-wus2` (mirror primary)
2. Create Application Gateway:
   - Name: `agw-hcc-dr-wus2`
   - Region: West US 2
   - Configuration: **Identical to primary**
   - Public IP: `pip-appgw-hcc-dr-wus2`
   - Backend pool: `pool-webapp-hcc-dr`
   - Health probe: `/health`
   - SSL certificate: From `kv-hcc-dr-wus2`

**Key Difference:**
- Initially configured but **not receiving traffic** (Traffic Manager handles routing)
- Can be scaled down to minimum instances (cost-saving)

**Validation:** DR App Gateway healthy, ready for failover

---

### 4.5 DR Web App

**Procedure:**
1. Create App Service Plan:
   - Name: `asp-hcc-dr-wus2`
   - Region: West US 2
   - Tier: Premium V3 P2v3
2. Create Web App:
   - Name: `app-hcc-dr-wus2`
   - Region: West US 2
   - Runtime: Same as primary
   - VNet integration: `vnet-hcc-dr-wus2` → WebAppSubnet
3. Configure settings (mirror primary)
4. Deploy same application code
5. Configure autoscaling (same rules as primary)
6. Add to DR Application Gateway backend pool

**Deployment Strategy:**
- **Active-Passive:** DR app runs but doesn't serve traffic
- **Active-Active (advanced):** DR app serves traffic for regional users

**Validation:** DR Web App accessible via DR App Gateway

---

### 4.6 DR SQL Database (Auto-Failover Group)

**Purpose:** Automatic database failover

#### 4.6.1 Create SQL Server (Secondary)
1. Create SQL Server in West US 2:
   - Name: `sql-hcc-dr-wus2`
   - Region: West US 2
   - Configuration: Mirror primary
   - Private endpoint: `pe-sql-hcc-dr-wus2`

#### 4.6.2 Create Auto-Failover Group
1. Navigate to Primary SQL Server → Failover groups → "+ Add group"
2. **Configure:**
   - Failover group name: `fog-hcc-sqldb`
   - Secondary server: `sql-hcc-dr-wus2`
   - Databases: Select `sqldb-hcc-prod`
   - Read/write failover policy: Automatic
   - Failover grace period: 1 hour
   - Read-only failover policy: Enabled
3. Click "Create"

**Deployment time:** 30-60 minutes (initial data sync)

#### 4.6.3 Update Application Connection Strings

**Primary Connection String (OLD):**
```
Server=sql-hcc-prod-eus2.database.windows.net;Database=sqldb-hcc-prod;
```

**Failover Group Endpoint (NEW):**
```
# Read-Write endpoint (always points to primary)
Server=fog-hcc-sqldb.database.windows.net;Database=sqldb-hcc-prod;

# Read-Only endpoint (always points to secondary)
Server=fog-hcc-sqldb.secondary.database.windows.net;Database=sqldb-hcc-prod;
```

**Update in Key Vault:**
- `kv-hcc-prod-eus2/secrets/db-server` → `fog-hcc-sqldb.database.windows.net`
- `kv-hcc-dr-wus2/secrets/db-server` → `fog-hcc-sqldb.database.windows.net`

**Validation:** 
- Data replicating to secondary
- Automatic failover tested
- Connection works from both regions

---

### 4.7 DR Redis Cache (Geo-Replication)

#### 4.7.1 Create DR Redis
1. Create Redis Cache in West US 2:
   - Name: `redis-hcc-dr-wus2`
   - Region: West US 2
   - Tier: Premium P2
   - Configuration: Mirror primary
   - Private endpoint: `pe-redis-hcc-dr-wus2`

#### 4.7.2 Configure Geo-Replication
1. Navigate to Primary Redis → Geo-replication → "+ Add geo-replication"
2. **Configure:**
   - Linked cache: `redis-hcc-dr-wus2`
   - Replication role: Primary (eus2), Secondary (wus2)
3. Start replication

**Note:** If primary fails, manually promote secondary to primary

**Validation:** Data replicating, both caches synchronized

---

### 4.8 DR Storage Account

Storage with RA-GRS automatically replicates to paired region (West US 2).

**Verify:**
1. Navigate to primary storage account
2. Configuration → Replication: RA-GRS
3. Secondary location: West US 2
4. Read access: Enabled

**DR Access Endpoint:**
```
Primary: https://sthccprodeus2.blob.core.windows.net/
Secondary (read-only): https://sthccprodeus2-secondary.blob.core.windows.net/
```

**Failover Procedure:**
1. Navigate to storage → Geo-replication → "Prepare for failover"
2. Confirm failover → Secondary becomes primary
3. Data loss possible (check last sync time)

**Validation:** Data accessible from secondary endpoint

---

## 5. TRAFFIC MANAGER CONFIGURATION

### 5.1 Create Traffic Manager Profile

**Purpose:** Intelligent DNS-based routing with automatic failover

**Procedure:**
1. Navigate to "Traffic Manager profiles" → "+ Create"
2. **Basics:**
   - Resource Group: `rg-hcc-prod-eus2` (or separate global RG)
   - Name: `tm-hcc-global` (creates DNS: tm-hcc-global.trafficmanager.net)
   - Routing method: **Priority** (primary/DR setup)
   - DNS TTL: 60 seconds (faster failover detection)
3. **Monitoring:**
   - Protocol: HTTPS
   - Port: 443
   - Path: `/health`
   - Probing interval: 10 seconds (Fast)
   - Tolerated number of failures: 3
   - Probe timeout: 5 seconds
4. Click "Create"

### 5.2 Add Endpoints

#### 5.2.1 Primary Endpoint (East US 2)
1. Navigate to Traffic Manager → Endpoints → "+ Add"
2. **Configure:**
   - Type: Azure endpoint
   - Name: `endpoint-primary-eus2`
   - Target resource type: Public IP address
   - Target resource: `pip-appgw-hcc-prod-eus2`
   - Priority: **1** (highest priority)
   - Custom header settings: `Host:agents.healthcarecallcenter.com`
   - Health status: Enabled
3. Save

#### 5.2.2 DR Endpoint (West US 2)
1. Add endpoint:
   - Name: `endpoint-dr-wus2`
   - Target: `pip-appgw-hcc-dr-wus2`
   - Priority: **2** (failover)
   - Health status: Enabled
2. Save

### 5.3 How Traffic Manager Works

**Normal Operations:**
```
User requests: agents.healthcarecallcenter.com
   ↓
DNS lookup
   ↓
Traffic Manager checks health
   ↓
Priority 1 (East US 2) is healthy → Return East US 2 IP
   ↓
User connects to East US 2 Application Gateway
```

**During Primary Failure:**
```
Traffic Manager health probe detects failure (3 consecutive failures)
   ↓
Marks Priority 1 as unhealthy
   ↓
Returns Priority 2 IP (West US 2)
   ↓
User connects to West US 2 Application Gateway
   ↓
Database auto-fails over to West US 2
```

**Validation:** Test failover by stopping primary App Gateway

---

## 6. DNS CONFIGURATION

### 6.1 Create DNS Zone
1. Navigate to "DNS zones" → "+ Create"
2. Name: `healthcarecallcenter.com`
3. Resource group: `rg-hcc-prod-eus2`

### 6.2 Add CNAME Record
1. Add record set:
   - Name: `agents`
   - Type: CNAME
   - Alias: `tm-hcc-global.trafficmanager.net`
   - TTL: 300

**Result:**
```
agents.healthcarecallcenter.com → tm-hcc-global.trafficmanager.net
   ↓
Traffic Manager returns appropriate IP based on health/priority
```

### 6.3 Update Nameservers
- Get Azure DNS nameservers
- Update at domain registrar
- Wait for propagation (up to 48 hours)

**Validation:** `nslookup agents.healthcarecallcenter.com` returns Traffic Manager

---

## 7. DISASTER RECOVERY PROCEDURES

### 7.1 Planned Failover (Maintenance)

**Use Case:** Scheduled maintenance in primary region

**Procedure:**
1. **Pre-Failover Checklist:**
   - [ ] Verify DR region health (all green)
   - [ ] Verify database replication lag < 5 seconds
   - [ ] Verify Redis geo-replication synced
   - [ ] Notify users of maintenance window
   - [ ] Create backup of current state

2. **Execute Failover:**
   ```bash
   # Step 1: Update Traffic Manager (manual)
   # Set primary endpoint to Disabled
   # DR endpoint becomes active automatically
   
   # Step 2: Database failover (if needed)
   az sql failover-group set-primary \
     --name fog-hcc-sqldb \
     --resource-group rg-hcc-dr-wus2 \
     --server sql-hcc-dr-wus2
   
   # Step 3: Promote Redis secondary (manual in portal)
   # Navigate to primary Redis → Geo-replication → Unlink
   # DR Redis becomes standalone primary
   
   # Step 4: Monitor
   # Check Traffic Manager DNS propagation
   # Monitor application logs
   # Verify user connections shifting to DR
   ```

3. **Verification:**
   - [ ] Users connecting to DR region
   - [ ] Database writes going to DR SQL
   - [ ] New calls being logged
   - [ ] No errors in application logs
   - [ ] Performance metrics normal

4. **Post-Failover:**
   - Monitor for 2 hours
   - Perform maintenance on primary
   - Prepare for failback

**RTO:** 5-10 minutes  
**RPO:** 0 (no data loss in planned failover)

### 7.2 Unplanned Failover (Disaster)

**Use Case:** Primary region complete outage

**Procedure:**
1. **Automatic Failover (if configured):**
   - Traffic Manager detects primary unhealthy (30 seconds)
   - Routes traffic to DR automatically
   - Database auto-fails over (within 1 hour grace period)
   
2. **Manual Intervention Required:**
   ```bash
   # Step 1: Force database failover (if automatic didn't trigger)
   az sql failover-group set-primary \
     --name fog-hcc-sqldb \
     --resource-group rg-hcc-dr-wus2 \
     --server sql-hcc-dr-wus2 \
     --allow-data-loss
   
   # Step 2: Unlink Redis geo-replication
   # Manual: Portal → Primary Redis → Geo-replication → Force unlink
   # Promotes DR Redis to standalone
   
   # Step 3: Storage failover (if needed)
   az storage account failover \
     --name sthccprodeus2 \
     --resource-group rg-hcc-prod-eus2
   
   # WARNING: This makes West US 2 the new primary
   # Data loss possible (check last sync time)
   ```

3. **Communication:**
   - Update status page
   - Email all users
   - Post in Teams/Slack
   - Notify leadership

4. **Monitoring:**
   - Watch DR region metrics closely
   - Scale up if needed
   - Check for cascading failures

**RTO:** 15 minutes  
**RPO:** 5 minutes (potential data loss)

### 7.3 Failback to Primary

**When:** After primary region restored and tested

**Procedure:**
1. **Pre-Failback:**
   - Verify primary region fully operational
   - Test all services in primary
   - Sync any data from DR to primary
   - Schedule failback window

2. **Execute Failback:**
   ```bash
   # Step 1: Re-establish geo-replication
   # Database: Reverse failover group
   az sql failover-group set-primary \
     --name fog-hcc-sqldb \
     --resource-group rg-hcc-prod-eus2 \
     --server sql-hcc-prod-eus2
   
   # Step 2: Re-link Redis
   # Portal: Primary Redis → Geo-replication → Add DR Redis
   
   # Step 3: Update Traffic Manager
   # Enable primary endpoint
   # Set priority back to 1
   
   # Step 4: Monitor traffic shift
   ```

3. **Validation:**
   - Traffic returning to primary
   - Database replication resumed
   - Redis sync active
   - No errors

**RTO:** 10 minutes  
**RPO:** 0 (planned failback)

---

## 8. COMPLIANCE & AUDIT

### 8.1 HIPAA Compliance Checklist

**Technical Safeguards:**
- [x] Access Control: Azure AD with MFA
- [x] Audit Controls: Log Analytics, SQL auditing
- [x] Integrity Controls: TDE, encryption at rest
- [x] Transmission Security: TLS 1.2+
- [x] Unique User Identification: Azure AD Object IDs
- [x] Emergency Access: Break-glass admin account
- [x] Automatic Logoff: 15-minute session timeout
- [x] Encryption: All data encrypted

**Administrative Safeguards:**
- [ ] Risk Assessment: Annual
- [ ] Workforce Training: HIPAA training
- [ ] Sanction Policy: Documented
- [ ] Information Access Management: RBAC
- [ ] Security Incident Procedures: Documented
- [ ] Contingency Plan: DR plan (this document)
- [ ] Evaluation: Annual security evaluation

**Physical Safeguards:**
- [x] Facility Access: Azure data center security
- [x] Workstation Security: Managed by IT
- [x] Device Control: Encryption required

### 8.2 DR Testing Schedule

**Monthly:** DR health check (automated)
**Quarterly:** Planned failover drill
**Annually:** Full DR simulation (unplanned scenario)

### 8.3 Audit Log Queries

**Database Replication Lag:**
```sql
SELECT 
    partner_server,
    partner_database,
    last_replication,
    replication_lag_sec,
    replication_state_desc
FROM sys.dm_geo_replication_link_status;
```

**Cross-Region Activity:**
```kql
AuditLog
| where Region != "EastUS2"
| summarize CallsInDR=count() by bin(Timestamp, 1h)
| render timechart
```

**Failover Events:**
```kql
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.SQL"
| where Category == "AutomaticFailover"
| project TimeGenerated, FailoverGroup=resource_s, Event=category_s, Details=properties_s
```

---

## 9. COST ESTIMATION

| Component | Primary (East US 2) | DR (West US 2) | Monthly Cost |
|-----------|---------------------|----------------|--------------|
| Application Gateway WAF v2 | 2-20 instances | 2-10 instances | $600 - $3,000 |
| App Service Premium V3 P2v3 | 3-20 instances | 2-10 instances | $600 - $4,000 |
| SQL Database (4 vCores) | Active | Geo-replica | $800 |
| Redis Premium P2 | Primary | Geo-replica | $400 |
| Storage RA-GRS 500GB | Primary + DR | - | $75 |
| Traffic Manager | Global | - | $5 |
| Key Vault Premium | 2 vaults | - | $10 |
| Log Analytics 200GB | Global | - | $400 |
| VNet, NSGs, Private Endpoints | Both regions | - | $150 |
| DDoS Protection Standard | Both regions | - | $3,000 |
| Bastion | Both regions | - | $280 |
| **Total (without DDoS)** | | | **$3,340 - $9,720** |
| **Total (with DDoS)** | | | **$6,340 - $12,720** |

**Cost Optimization:**
- DR region scaled down when not active
- Use Reserved Instances (1-year commitment): Save 30-40%
- Azure Hybrid Benefit (if applicable): Additional savings

---

## 10. APPENDICES

### Appendix A: Resource Naming Convention

| Resource Type | Format | Example |
|---------------|--------|---------|
| Resource Group | `rg-{app}-{env}-{region}` | `rg-hcc-prod-eus2` |
| VNet | `vnet-{app}-{env}-{region}` | `vnet-hcc-prod-eus2` |
| Subnet | `{purpose}Subnet` | `AppGatewaySubnet` |
| NSG | `nsg-{subnet}-{app}-{env}-{region}` | `nsg-appgw-hcc-prod-eus2` |
| App Gateway | `agw-{app}-{env}-{region}` | `agw-hcc-prod-eus2` |
| Web App | `app-{app}-{env}-{region}` | `app-hcc-prod-eus2` |
| SQL Server | `sql-{app}-{env}-{region}` | `sql-hcc-prod-eus2` |
| SQL Database | `sqldb-{app}-{env}` | `sqldb-hcc-prod` |
| Redis | `redis-{app}-{env}-{region}` | `redis-hcc-prod-eus2` |
| Storage | `st{app}{env}{region}` | `sthccprodeus2` |
| Key Vault | `kv-{app}-{env}-{region}` | `kv-hcc-prod-eus2` |
| Log Analytics | `log-{app}-{scope}` | `log-hcc-global` |

### Appendix B: Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Project Manager | [Name] | [Phone] | [Email] |
| Cloud Architect | [Name] | [Phone] | [Email] |
| DBA (On-Call) | [Name] | [Phone] | [Email] |
| Network Engineer | [Name] | [Phone] | [Email] |
| Security Lead | [Name] | [Phone] | [Email] |
| Azure Support | Microsoft | 1-800-XXX-XXXX | - |

### Appendix C: SLA Calculations

**Composite SLA:**
```
Traffic Manager: 99.99%
Application Gateway: 99.95%
App Service: 99.95%
SQL Database (Geo-replication): 99.99%
Redis Premium: 99.9%

Composite SLA = 0.9999 × 0.9995 × 0.9995 × 0.9999 × 0.999
              = 99.78%

Allowed downtime per year: 19.26 hours
Allowed downtime per month: 1.6 hours
```

**With DR failover:**
- RTO: 15 minutes
- Expected availability: 99.95%+

---

**Document Version Control:**
- Version 1.0 - January 30, 2026 - Initial SOP with DR
- Review Schedule: Quarterly
- Next Review: April 30, 2026
- Document Approver: [Name, Title]

**END OF SOP**
