# LogSentry — AI-Powered Log Analysis Platform

**Live Application:** **[http://rustam.cloud](http://rustam.cloud)**

A production-minded, full-stack log analysis tool that uses an AI backend to diagnose and solve application errors. This repository is a **monorepo** that contains the complete, deployable application: the Python backend, the JavaScript frontend, the Infrastructure as Code (IaC), and the CI/CD pipeline.

This project demonstrates a secure, automated, and cloud-native "Git-to-Production" workflow.

## Tech & Versions at a Glance

> **Application & Frontend**
> * **Python 3.11** (Backend API)
> * **Flask** / **Gunicorn** (Web server)
> * **JavaScript (ES6+)** (Dynamic frontend logic)
> * **HTML5 / CSS3 / Bootstrap 5** (Responsive UI)
> * `marked.js` (For rendering AI-generated Markdown)

> **Authentication & AI**
> * **Firebase Authentication** (Secure user registration & login)
> * **Google Gemini API** (`gemini-2.5-flash-preview-09-2025`) (For AI error analysis)

> **DevOps & Cloud (The SRE Pipeline)**
> * **Containerization:** **Docker** (Multi-stage builds)
> * **Registry:** **Docker Hub**
> * **Cloud:** **AWS** (EC2, Elastic IP, IAM, Secrets Manager, Security Groups)
> * **Infrastructure as Code (IaC):** **Terraform**
> * **CI/CD:** **GitHub Actions**

---

## What’s Inside (High-Level)

* **Python/Flask Backend:** A secure, token-protected API with a "freemium" model that grants 3 free uses to guest users (tracked by server-side `session`) and unlimited access to registered users.
* **JavaScript Frontend:** A fully dynamic single-page-application-style dashboard. All authentication, log uploads, and AI analysis are handled by asynchronous `fetch` requests without page reloads.
* **Firebase Auth:** A modern, serverless authentication model. The frontend client handles all user registration/login with Firebase, and the backend verifies the received JWTs (ID Tokens) using the `firebase-admin` SDK.
* **Infrastructure (Terraform):** The *entire* cloud infrastructure is defined "as-code" using Terraform. This includes the server, the networking, the static IP, and all security policies.
* **Security (IAM & Secrets):** A professional security posture. All secrets (API keys, credentials) are stored in **AWS Secrets Manager** and are **never** in Git. The EC2 instance uses a **least-privilege IAM Role** to securely fetch its own credentials at boot time.
* **CI/CD (GitHub Actions):** A fully automated deployment pipeline. A `git push` to the `main` branch automatically builds a new Docker image, pushes it to Docker Hub, and deploys the new container to the live EC2 server.

## Architecture

### Production Topology (AWS)

The architecture is designed to be secure and cloud-native.
1.  A user visits `rustam.cloud`. DNS (an "A" record) points the domain to a permanent **AWS Elastic IP**.
2.  The Elastic IP is attached to an **EC2 Instance**. An **AWS Security Group** acts as a firewall, only allowing traffic on ports 80 (HTTP) and 22 (SSH).
3.  On the EC2 instance, a **Docker** container (managed by Gunicorn) runs the **Flask (Python) Application**.
4.  When the app starts, it uses its attached **IAM Role** to read its credentials (Gemini key, Firebase key) from **AWS Secrets Manager**.
5.  When a user logs in, the **JavaScript Client** talks directly to **Firebase** to get an auth token.
6.  When a user uploads a log or requests AI analysis, the client sends the `fetch` request (with the token) to the Flask app.
7.  The Flask app verifies the token with Firebase, performs the analysis, and (if needed) calls the **Google Gemini API**.

### Production Topology (AWS)

```mermaid
graph TD
    subgraph Client
        A[User Browser (JavaScript Frontend)]
    end

    subgraph Internet & AWS Edge
        B(DNS: rustam.cloud) --> C[Elastic IP: 35.168.123.128]
        D(Firebase Authentication)
    end

    subgraph AWS EC2 Instance (Docker Host)
        E[Security Group: Port 80, 22]
        F[Container: logsentry-container]
        G[IAM Role: Read Secrets Manager]
    end

    subgraph AWS Secrets Manager
        H[Secrets: GEMINI_API_KEY, FIREBASE_CREDS]
    end

    subgraph Google Gemini API
        I[AI Analysis Service]
    end

    A -- HTTPS --> B
    B --> C
    C -- HTTP (Port 80) --> E
    E --> F
    F -- Initial App Startup --> G
    G -- GetSecretValue --> H
    A -- Authentication Request --> D
    D -- ID Token --> A
    A -- /upload-log, /analyze-error (with ID Token) --> F
    F -- Verify ID Token --> D
    F -- AI Request --> I

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style B fill:#add8e6,stroke:#333,stroke-width:2px
    style C fill:#add8e6,stroke:#333,stroke-width:2px
    style D fill:#98fb98,stroke:#333,stroke-width:2px
    style E fill:#d3d3d3,stroke:#333,stroke-width:2px
    style F fill:#ffa07a,stroke:#333,stroke-width:2px
    style G fill:#ffd700,stroke:#333,stroke-width:2px
    style H fill:#ffd700,stroke:#333,stroke-width:2px
    style I fill:#98fb98,stroke:#333,stroke-width:2px
```

### CI/CD Topology (GitHub Actions)

This workflow creates a "Git-to-Production" pipeline:
1.  A developer (SRE) runs `git push origin main` to the GitHub repository.
2.  This automatically triggers a **GitHub Actions** workflow.
3.  **Job 1 (Build):** GitHub builds the `Dockerfile` into a new `logsentry:latest` image and pushes it to **Docker Hub**.
4.  **Job 2 (Deploy):** After the build succeeds, GitHub uses a stored **SSH private key** to connect to the EC2 server.
5.  The deploy script runs `docker pull`, `docker stop` (on the old container), and `docker run` (on the new image), achieving an automated, low-downtime deployment.

## Authentication & Token Flow

This application uses a stateless, token-based authentication model.

1.  A user visits the `/register` or `/login` page.
2.  The **JavaScript client** (in the browser) sends the email/password directly to **Firebase Authentication**.
3.  Firebase creates the user and sends back a **JWT (ID Token)** to the client.
4.  Before any protected API call (like `/upload-log` or `/analyze-error`), the client-side `auth.js` script runs `auth.currentUser.getIdToken(true)`. This gets a valid, fresh token from Firebase.
5.  The client sends a `fetch` request to the backend with the header: `Authorization: Bearer <token>`.
6.  The Flask server's `@token_required` decorator intercepts the request, grabs the token, and uses the `firebase-admin` SDK to verify its signature and expiration with Google's servers.
7.  If the token is valid, the request is processed. If not, a `401 (UNAUTHORIZED)` is returned.

## Security Posture

* **No Secrets in Git:** A robust `.gitignore` file blocks all secrets (`.env`, `firebase_creds.json`, `terraform.tfvars`) and state files (`.tfstate`) from ever being committed.
* **Infrastructure Secrets:** All production credentials are read from **AWS Secrets Manager**, which is populated by the secure `terraform.tfvars` file on the administrator's local machine.
* **Least-Privilege IAM:** The EC2 instance has an `IAM Role` that *only* grants it `secretsmanager:GetSecretValue` permissions on its *own* specific secrets.
* **Network Hardening:** The **AWS Security Group** only exposes ports 80 (HTTP) and 22 (SSH). All other ports are blocked.
* **Container Security:** The `Dockerfile` uses a multi-stage build and runs the final application as a non-root `appuser`.
* **Firebase Auth:** Firebase provides built-in brute-force protection, password hashing, and secure token management.
* **Freemium Security:** The freemium counter is handled by the server-side Flask `session`, which is cryptographically signed and cannot be tampered with by the client.

## Containerization & Deployment

### Local Development (Quick Start)

1.  **Clone the repo.**
2.  **Create Secrets:**
    * Create `.env` (for `GEMINI_API_KEY`, `FLASK_SECRET_KEY`).
    * Create `firebase_creds.json` (downloaded from Firebase).
3.  **Run Locally (Python):**
    * `python3 -m venv venv`
    * `source venv/bin/activate`
    * `pip install -r requirements.txt`
    * `python app.py` (App runs on `http://127.0.0.1:5000`)
4.  **Run Locally (Docker):**
    * `docker build -t logsentry:latest .`
    * `docker run -d --rm -p 5000:8000 --env-file ./.env -v "$(pwd)/firebase_creds.json:/home/appuser/firebase_creds.json:ro" --name logsentry-container logsentry:latest`

### Production Deployment (Terraform & GitHub Actions)

The production deployment is **100% automated**.

1.  **Infrastructure (Terraform):**
    * Fill out `terraform.tfvars` with secrets and your Docker Hub name.
    * Run `terraform init`.
    * Run `terraform apply -auto-approve`. (This builds the entire AWS environment).
2.  **CI/CD (GitHub Actions):**
    * Add your `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `AWS_SSH_KEY`, and `AWS_SSH_HOST` to your GitHub repository's **Actions secrets**.
    * `git push origin main`.
    * The GitHub Actions workflow automatically builds the image and deploys it to the server created by Terraform.

## Project Goals

* Demonstrate a secure, end-to-end, cloud-native application from development to production.
* Showcase a professional SRE/DevOps pipeline using modern, "as-code" tools (Terraform, Docker, GitHub Actions).
* Implement a robust security model using least-privilege **IAM Roles** and **AWS Secrets Manager**.
* Build a useful, public-facing tool that solves a real-world problem (log analysis).

## Future Roadmap (Next Steps)

* **HTTPS:** Implement a reverse proxy (Nginx) on the server and use **Let's Encrypt** to add free SSL/TLS (HTTPS).
* **Database:** Add a database (like **AWS RDS for PostgreSQL**) to store user log history and analysis results.
* **Parser Expansion:** Update `log_parser.py` to support more formats, like JSON-structured logs and Nginx access logs.
* **FAQ Page:** Add a "FAQ" page to the navigation.