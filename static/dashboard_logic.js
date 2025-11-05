// This file contains all the JavaScript logic for the dashboard page

document.addEventListener('DOMContentLoaded', function() {
    
    const uploadForm = document.getElementById('upload-form');
    const uploadButton = document.getElementById('upload-button');
    const uploadSpinner = document.getElementById('upload-spinner');
    const uploadButtonText = document.getElementById('upload-button-text');
    const fileInput = document.getElementById('log_file_input');
    
    const resultsContainer = document.getElementById('analysis-results-container');
    const errorContainer = document.getElementById('error-list-container');
    
    // --- 1. Handle the Log File Upload ---
    
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault(); // Stop normal form submission
        
        if (!fileInput.files || fileInput.files.length === 0) {
            showAlert('Please select a file to analyze.', 'warning');
            return;
        }
        
        // Show loading state
        uploadButton.disabled = true;
        uploadSpinner.style.display = 'inline-block';
        uploadButtonText.textContent = 'Analyzing...';
        resultsContainer.innerHTML = ''; // Clear old results
        errorContainer.innerHTML = '';  // Clear old results
        
        // Prepare form data
        const formData = new FormData();
        formData.append('log_file', fileInput.files[0]);
        // 💥 FIX: CSRF Token is no longer needed
        
        // Get the auth token (if user is logged in)
        const token = await getAuthToken();
        
        const headers = new Headers();
        if (token) {
            headers.append('Authorization', `Bearer ${token}`);
        }
        
        try {
            // Send file to the backend
            const response = await fetch('/upload-log', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const data = await response.json();

            // 💥 FIX: Better error handling
            if (!response.ok) {
                // Handle errors from the server (like "no free uses left")
                throw new Error(data.error || 'An unknown error occurred.');
            }
            
            // Handle freemium message
            if (data.flash_message) {
                showAlert(data.flash_message, 'info');
            }

            // --- 2. Build the Results HTML Dynamically ---
            buildResultsCards(data.analysis);
            
        } catch (error) {
            console.error('Upload Error:', error);
            showAlert(error.message, 'danger'); // This will now show "No free analyses left."
        } finally {
            // Reset button
            uploadButton.disabled = false;
            uploadSpinner.style.display = 'none';
            uploadButtonText.textContent = 'Analyze Log';
        }
    });
    
    // --- 3. Function to build the HTML cards (Unchanged) ---
    
    function buildResultsCards(analysis) {
        // Build Statistics Card
        resultsContainer.innerHTML = `
            <div class="card shadow-sm mb-4" style="border-top: 4px solid var(--bs-primary);">
                <div class="card-header bg-white border-0">
                    <h3 class="mb-0"><i class="bi bi-bar-chart-line-fill me-2 text-primary"></i>Analysis Results: ${analysis.filename}</h3>
                </div>
                <div class="card-body">
                    <h4 class="fw-normal">Summary Statistics</h4>
                    <div class="row text-center mb-4">
                        <div class="col-md-4">
                            <div class="card bg-light p-3 icon-card">
                                <i class="bi bi-card-list icon text-primary"></i>
                                <div><h5 class="text-primary-emphasis">Total Lines</h5><h2>${analysis.total_lines}</h2></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card bg-light p-3 icon-card">
                                <i class="bi bi-bug-fill icon text-danger"></i>
                                <div><h5 class="text-danger-emphasis">Total Errors</h5><h2>${analysis.errors_found}</h2></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card bg-light p-3 icon-card">
                                <i class="bi bi-exclamation-triangle-fill icon text-warning"></i>
                                <div><h5 class="text-warning-emphasis">Total Warnings</h5><h2>${analysis.warnings_found}</h2></div>
                            </div>
                        </div>
                    </div>
                    <div class="row justify-content-center">
                        <div class="col-md-8">
                            <h4 class="mt-4 fw-normal">Log Level Distribution</h4>
                            <table class="table table-bordered table-hover">
                                <thead class="table-light">
                                    <tr>
                                        <th><i class="bi bi-tags-fill me-2"></i>Log Level</th>
                                        <th><i class="bi bi-hash me-2"></i>Count</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.entries(analysis.log_levels).sort().map(([level, count]) => `
                                        <tr>
                                            <td>${formatLogLevel(level)}</td>
                                            <td>${count}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Build Error List Card (if there are errors)
        if (analysis.error_lines && analysis.error_lines.length > 0) {
            errorContainer.innerHTML = `
                <div class="card shadow-sm mb-4" style="border-top: 4px solid var(--bs-danger);">
                    <div class="card-header bg-white border-0">
                        <h3 class="mb-0"><i class="bi bi-list-task me-2 text-danger"></i>Detected Error Messages (First 50)</h3>
                    </div>
                    <div class="card-body">
                        <p>The following "Error" level messages were extracted from the log:</p>
                        <ul id="error-list" class="list-group list-group-flush">
                            ${analysis.error_lines.map((message, index) => `
                                <li class="list-group-item" id="error-item-${index}">
                                    <code class="error-message-code" style="white-space: pre-wrap; word-break: break-all;">${message}</code>
                                    <div class="text-end mt-2">
                                        <button class="btn btn-primary analyze-ai-button" data-error-id="error-item-${index}">
                                            <i class="bi bi-robot me-1"></i> Analyze with AI
                                        </button>
                                    </div>
                                    <div class="ai-solution-box mt-3" style="display: none;">
                                        <h5 class="text-primary-emphasis"><i class="bi bi-stars me-1"></i>AI Analysis & Solution:</h5>
                                        <div class="solution-content p-3 bg-light rounded border" style="font-family: inherit; white-space: normal;"></div>
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            `;
            
            // Add click listeners to the new buttons
            addAiButtonListeners();
        }
    }
    
    function formatLogLevel(level) {
        if (level === 'Error') {
            return `<strong><i class="bi bi-bug-fill text-danger me-2"></i>${level}</strong>`;
        } else if (level === 'Warning') {
            return `<strong><i class="bi bi-exclamation-triangle-fill text-warning me-2"></i>${level}</strong>`;
        } else {
            return `<i class="bi bi-info-circle text-muted me-2"></i>${level}`;
        }
    }
    
    // --- 4. Function to add listeners to all AI buttons (Unchanged) ---
    
    function addAiButtonListeners() {
        document.querySelectorAll('.analyze-ai-button').forEach(button => {
            button.addEventListener('click', function() {
                analyzeError(this, this.getAttribute('data-error-id'));
            });
        });
    }

    // --- 5. Function to handle the AI analysis click (Unchanged, but CSRF token removed) ---
    
    async function analyzeError(button, errorItemId) {
        const errorItem = document.getElementById(errorItemId);
        if (!errorItem) return;

        const codeElement = errorItem.querySelector('.error-message-code');
        const logMessage = codeElement.textContent.trim();
        
        const solutionBox = errorItem.querySelector('.ai-solution-box');
        const solutionContent = solutionBox.querySelector('.solution-content');

        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Analyzing...';
        solutionContent.innerHTML = '<span class="text-muted">Thinking... Please wait.</span>';
        solutionBox.style.display = 'block';

        const token = await getAuthToken();
        if (!token) {
            showAlert('You must be logged in to use the AI analysis feature. Guests get 3 free log uploads, but AI analysis is for registered users only.', 'warning');
            button.innerHTML = '<i class="bi bi-robot me-1"></i> Analyze with AI';
            button.disabled = false;
            solutionBox.style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/analyze-error', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                    // 💥 FIX: 'X-CSRFToken' header is removed
                },
                body: JSON.stringify({
                    'log_message': logMessage
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            solutionContent.innerHTML = marked.parse(data.solution);
            button.innerHTML = '<i class="bi bi-check-circle me-1"></i> Analysis Complete';

        } catch (error) {
            console.error('AI Analysis Error:', error);
            solutionContent.innerHTML = `<strong class="text-danger">Error during analysis:</strong><br>${error.message}`;
            button.innerHTML = '<i class="bi bi-exclamation-triangle me-1"></i> Analysis Failed';
            button.disabled = false;
        }
    }
    
});
