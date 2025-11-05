import os
import json
import requests
import firebase_admin
from firebase_admin import credentials, auth
# 💥💥💥 FIX: Import 'g' and 'wraps' 💥💥💥
from flask import Flask, render_template, redirect, url_for, request, flash, jsonify, session, g
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from functools import wraps

# --- INITIALIZATION ---
load_dotenv()

# --- Initialize Firebase Admin ---
try:
    cred = credentials.Certificate('firebase_creds.json') 
    firebase_admin.initialize_app(cred)
    print("--- Firebase Admin Initialized ---")
except Exception as e:
    print(f"--- FATAL: Could not initialize Firebase Admin: {e} ---")
    print("--- MAKE SURE 'firebase_creds.json' IS IN THE ROOT DIRECTORY ---")

from log_parser import parse_log_file 

# --- CONFIGURATION ---
app = Flask(__name__)
# This will now load your key from the .env file
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY') # Removed fallback
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ALLOWED_EXTENSIONS'] = {'log', 'txt'}
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])
# ---------------------

# --- AI HELPER (Unchanged) ---
def call_ai_api(log_error_message):
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '').strip('"') 
    if not GEMINI_API_KEY:
        return "Error: GEMINI_API_KEY environment variable not set on the server."
    
    model_name = 'gemini-2.5-flash-preview-09-2025'
    apiUrl = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
    
    system_prompt = (
        "You are an expert SRE (Site Reliability Engineer) and Senior DevOps specialist. "
        "A user is providing you with a raw log file error message. "
        "Your task is to: "
        "1. Briefly explain what the error means in simple terms. "
        "2. Provide a clear, step-by-step list of recommended actions to fix the root cause. "
        "3. Format your response clearly using Markdown (e.g., use **bolding** for titles and numbered lists for steps)."
    )
    user_query = f"Here is the log error. Please analyze it and tell me how to fix it:\n\n{log_error_message}"
    payload = {
        "contents": [{"parts": [{"text": user_query}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]}
    }
    headers = {'Content-Type': 'application/json'}
    
    try:
        response = requests.post(apiUrl, headers=headers, data=json.dumps(payload), timeout=45)
        response.raise_for_status() 
        result = response.json()
        text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        if not text: return "Error: The AI API returned an empty response."
        return text
    except requests.exceptions.RequestException as e:
        print(f"--- GEMINI API ERROR: {e} ---")
        return f"Error: Failed to connect to the AI API. Check server logs. Details: {e}"
    except Exception as e:
        print(f"--- UNKNOWN ERROR in call_ai_api: {e} ---")
        return f"Error: An unexpected error occurred. Details: {e}"
# ---------------------------

#
# 💥💥💥 FIX: Added the missing allowed_file function 💥💥💥
#
def allowed_file(filename):
    """Checks if a file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']
# ---------------------------


# --- Auth Decorator (Unchanged) ---
def token_required(f):
    """Decorator to verify Firebase ID token."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({"error": "Authentication token is missing."}), 401
        
        try:
            token = token.split(' ')[1]
            # 💥 FIX: Save user to 'g' object for access
            g.user = auth.verify_id_token(token) 
        except Exception as e:
            print(f"Token verification error: {e}")
            return jsonify({"error": "Invalid or expired authentication token."}), 401
        
        return f(*args, **kwargs)
    return decorated_function
# ---------------------------

# --- PUBLIC PAGE ROUTES (Unchanged) ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/docs')
def docs():
    return render_template('docs.html')

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/register')
def register():
    return render_template('register.html')

@app.route('/privacy')
def privacy():
    return render_template('privacy.html')

@app.route('/terms')
def terms():
    return render_template('terms.html')

# --- DASHBOARD PAGE (Unchanged, just renders the shell) ---
@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html') 

# --- PROTECTED API ROUTES ---

@app.route('/upload-log', methods=['POST'])
def upload_log():
    """
    This is the new API endpoint for uploading files.
    It handles both registered users and "freemium" guests.
    """
    # 💥💥💥 FIX: Wrap the *ENTIRE* function in a try...except block 💥💥💥
    try:
        token = request.headers.get('Authorization')
        is_registered_user = False
        flash_message = None 
        
        if token:
            try:
                token = token.split(' ')[1]
                auth.verify_id_token(token)
                is_registered_user = True
            except Exception:
                is_registered_user = False 

        # --- Freemium Logic ---
        if not is_registered_user:
            # This logic will now fail if SECRET_KEY is missing
            uses_left = session.get('free_uses', 3)
            if uses_left <= 0:
                return jsonify({"error": "You have no free analyses left. Please register to continue."}), 403
            session['free_uses'] = uses_left - 1
            flash_message = f"You are using a free analysis. You have {session['free_uses']} free analyses left. Register for unlimited use!"
        
        # --- Simplified File Handling ---
        if 'log_file' not in request.files:
            return jsonify({"error": "No 'log_file' part in the request."}), 400
            
        file = request.files['log_file']
        
        if file.filename == '':
            return jsonify({"error": "No selected file."}), 400

        # This line will now work because allowed_file() exists
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            # This try/except handles parsing errors
            try:
                file.save(filepath)
                analysis_results = parse_log_file(filepath)
                os.remove(filepath)
                
                response_data = {"success": True, "analysis": analysis_results}
                if flash_message: 
                    response_data['flash_message'] = flash_message
                    
                return jsonify(response_data)
                
            except Exception as e:
                if os.path.exists(filepath): os.remove(filepath)
                return jsonify({"error": f'File processing failed: {e}. Check log format.'}), 500
        else:
            return jsonify({"error": 'File type not allowed.'}), 400
            
    # 💥 This block will catch ANY unhandled error (like the session crash)
    except Exception as e:
        print(f"--- FATAL ERROR in /upload-log: {e} ---")
        # Check if it's the session error
        if "session" in str(e):
             print("--- INFO: This is likely caused by a missing FLASK_SECRET_KEY in your .env file. ---")
             return jsonify({"error": "A server session error occurred. Please ensure FLASK_SECRET_KEY is set."}), 500
        # Return a generic JSON error
        return jsonify({"error": f"An unexpected server error occurred: {e}"}), 500

@app.route('/analyze-error', methods=['POST'])
@token_required # <-- This route is still fully protected
def analyze_error():
    # 💥💥💥 FIX: Wrap in try...except block 💥💥💥
    try:
        data = request.get_json()
        if not data or 'log_message' not in data:
            return jsonify({"error": "No log_message provided"}), 400

        solution = call_ai_api(data['log_message'])
        return jsonify({"solution": solution})
        
    except Exception as e:
        print(f"Error in /analyze-error route: {e}")
        return jsonify({"error": f"Failed to analyze: {e}"}), 500

# --- RUN THE APP ---
if __name__ == '__main__':
    # 💥 FIX: Check for essential keys before starting
    if not os.environ.get('FLASK_SECRET_KEY'):
        print("--- FATAL STARTUP ERROR: FLASK_SECRET_KEY is not set in your .env file. ---")
        print("--- Please run: python -c 'import secrets; print(secrets.token_hex(24))' and add it to .env ---")
    elif not os.environ.get('GEMINI_API_KEY'):
        print("--- FATAL STARTUP ERROR: GEMINI_API_KEY is not set in your .env file. ---")
    else:
        print("--- All .env keys found. Starting server. ---")
        app.run(debug=True)

