# --- Stage 1: The "Builder" ---
# We use a full Python image to install our packages
FROM python:3.11-slim as builder

# Set the working directory for the virtual environment
WORKDIR /opt/venv

# Create a virtual environment inside this directory
RUN python -m venv .

# Copy our requirements file in
COPY requirements.txt .

# Install the dependencies into the virtual environment
# This caches them in this "builder" layer
RUN . bin/activate && pip install --no-cache-dir -r requirements.txt


# --- Stage 2: The "Final" Image ---
# We start fresh with a clean Python image
FROM python:3.11-slim

# Create a non-root user ("appuser") for security
# This is a critical SRE best practice
RUN useradd -m -s /bin/bash appuser
USER appuser

# Set the home directory for our new user
WORKDIR /home/appuser

# Copy the virtual environment (with all the packages)
# from the "builder" stage into our final image
COPY --chown=appuser:appuser --from=builder /opt/venv /opt/venv

# Copy our application code (Python, static, templates)
# The .dockerignore file will prevent secrets from being copied
COPY --chown=appuser:appuser . .

# Set the PATH to use the Python from our virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Tell Docker that our app will run on port 8000
EXPOSE 8000

# This is the command to start the app
# We use Gunicorn (our production server)
# --workers=4: Handles 4 requests at a time
# --bind=0.0.0.0:8000: Listen on port 8000
# --timeout=60: Give the AI 60 seconds to respond
# app:app: Run the 'app' object from the 'app.py' file
CMD ["gunicorn", "--workers=4", "--bind=0.0.0.0:8000", "--timeout=60", "app:app"]