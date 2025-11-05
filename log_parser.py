import os
import re
from collections import Counter

#
# NEW REGEX for your application log (CSV format)
# This pattern captures the second field, which is the log level.
#
# Format: 10/26/2025 10:07:25 PM, Information, e2fcef22-95ca-472e-bf8c-ab8db4d54600, ...
#
CUSTOM_LOG_PATTERN = re.compile(
    # Group 1: Timestamp (anything up to the first comma)
    r'^(?P<timestamp>[^,]+),'
    # Group 2: Log Level (the text between the first and second comma)
    r'\s*(?P<log_level>\S+?)\s*,'
    # Group 3: The rest of the line is the message
    r'\s*(?P<message>.*)'
)

def parse_log_file(filepath):
    """
    Reads a log file, processes it line by line using Regex, 
    and returns aggregated statistics for the dashboard.
    """
    total_lines = 0
    errors_found = 0
    warnings_found = 0
    
    level_counts = Counter()
    error_lines = [] # List to store actual error messages
    
    print(f"--- Starting analysis of file: {filepath} ---")

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                total_lines += 1
                
                match = CUSTOM_LOG_PATTERN.match(line)
                
                if match:
                    data = match.groupdict()
                    level = data['log_level'].strip()
                    level_counts[level] += 1
                    
                    if level == 'Error':
                        errors_found += 1
                        # Add the full message to our list
                        # We only store the first 50 to avoid crashing the browser
                        if len(error_lines) < 50:
                            error_lines.append(data['message'])
                            
                    elif level == 'Warning':
                        warnings_found += 1
                
    except FileNotFoundError:
        print(f"Error: Log file not found at {filepath}")
        return {}
    except Exception as e:
        print(f"An error occurred during parsing: {e}")
        raise e
    
    # Prepare the final results
    status_summary = {k: v for k, v in level_counts.items()}
    
    print(f"--- Analysis Complete: {errors_found} errors found. ---")
    
    return {
        'total_lines': total_lines,
        'errors_found': errors_found,
        'warnings_found': warnings_found,
        'log_levels': status_summary,
        'error_lines': error_lines, # Pass the list to the template
        'filename': os.path.basename(filepath) 
    }