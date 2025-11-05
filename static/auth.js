// This file manages the Firebase Authentication state

// --- Global helper function to show alerts ---
function showAlert(message, type = 'danger', dismissable = true) {
    const alertBox = document.getElementById('global-alert-box');
    
    let dismissButton = '';
    if (dismissable) {
        dismissButton = '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
    }

    alertBox.innerHTML = `
        <div class="alert alert-${type} ${dismissable ? 'alert-dismissible' : ''} fade show" role="alert">
            ${message}
            ${dismissButton}
        </div>
    `;
    alertBox.style.display = 'block';
    
    if (dismissable) {
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const alert = bootstrap.Alert.getInstance(alertBox.querySelector('.alert'));
            if (alert) {
                alert.close();
            }
        }, 5000);
    }
}

// --- Listen for changes in authentication state ---
auth.onAuthStateChanged(user => {
    const authLinks = document.getElementById('auth-links');
    const userLinks = document.getElementById('user-links');
    
    if (user) {
        // User is logged in
        authLinks.style.display = 'none';
        userLinks.style.display = 'flex';
        document.getElementById('user-email-display').textContent = user.email;
    } else {
        // User is logged out
        authLinks.style.display = 'flex';
        userLinks.style.display = 'none';
        document.getElementById('user-email-display').textContent = '';
    }
});

// --- Add click listener for the logout button ---
const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        auth.signOut().then(() => {
            // Sign-out successful.
            window.location.href = '/'; // Redirect to home
        }).catch((error) => {
            // An error happened.
            console.error('Logout Error:', error);
            showAlert('Failed to log out. Please try again.', 'danger');
        });
    });
}

// --- Function to get the current user's ID token ---
// This is the most important function for our protected API calls
async function getAuthToken() {
    const user = auth.currentUser;
    if (!user) {
        return null;
    }
    try {
        // Get the ID token from Firebase, force refresh if needed
        const token = await user.getIdToken(true); 
        return token;
    } catch (error) {
        console.error('Error getting auth token:', error);
        // If token expires, sign user out to fix it
        auth.signOut();
        return null;
    }
}