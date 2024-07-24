from flask import Flask, request, jsonify, redirect, url_for
import requests
from msal import ConfidentialClientApplication

app = Flask(__name__)

# Constants - replace these with your actual details
CLIENT_ID = '562c9dc8-115f-4dc1-9c2a-964c18930436'
CLIENT_SECRET = 'ud88Q~jr_eDuzgmDkYKjK3XfjM_WsCkSi5T_QcEO'  # Secure this appropriately
TENANT_ID = '65a0991e-4d13-421c-9610-8f07161bb81e'
AUTHORITY = f'https://login.microsoftonline.com/{TENANT_ID}'
SCOPE = ['https://graph.microsoft.com/.default']
USER_EMAIL = 'ithelpform@sbsbit.com'

# Initialize MSAL Confidential Client Application
app_instance = ConfidentialClientApplication(
    client_id=CLIENT_ID,
    authority=AUTHORITY,
    client_credential=CLIENT_SECRET,
)

@app.route('/submit-form', methods=['POST'])
def submit_form():
    # Extract data from form
    subject = "IT Support Request"
    content = f"Name: {request.form['name']}\nEmail: {request.form['email']}\nCity: {request.form['city']}\nCategory: {request.form['category']}\nPhone: {request.form['phone']}\nMessage: {request.form['message']}"
    recipient_emails = ["tflatt@sbsb-eastham.com"]

    # Acquire token
    token_response = app_instance.acquire_token_for_client(scopes=SCOPE)
    if "access_token" in token_response:
        access_token = token_response['access_token']
        # Prepare the email message
        to_recipients = [{"emailAddress": {"address": email}} for email in recipient_emails]
        email_payload = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "Text",
                    "content": content
                },
                "toRecipients": to_recipients
            },
            "saveToSentItems": "true"
        }

        # Send the email
        headers = {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': 'application/json'
        }
        response = requests.post(
            f'https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/sendMail',
            headers=headers,
            json=email_payload
        )

        if response.status_code == 202:
            return jsonify({"status": "success", "message": "Email sent successfully"})
        else:
            return jsonify({"status": "error", "message": "Failed to send email", "details": response.text})
    else:
        return jsonify({"status": "error", "message": "Failed to acquire token", "details": token_response.get('error_description')})

if __name__ == '__main__':
    app.run(debug=True)
