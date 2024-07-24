import requests
from msal import ConfidentialClientApplication

# Constants - replace these with your actual details
CLIENT_ID = '562c9dc8-115f-4dc1-9c2a-964c18930436'
CLIENT_SECRET = 'ud88Q~jr_eDuzgmDkYKjK3XfjM_WsCkSi5T_QcEO'  # Consider securing this
TENANT_ID = '65a0991e-4d13-421c-9610-8f07161bb81e'
AUTHORITY = f'https://login.microsoftonline.com/{TENANT_ID}'  # Corrected to use variable
SCOPE = ['https://graph.microsoft.com/.default']  # Default scope for application permissions
USER_EMAIL = 'ithelpform@sbsbit.com'  # The email that will be used to send emails

# Initialize MSAL Confidential Client Application
app = ConfidentialClientApplication(
    client_id=CLIENT_ID,
    authority=AUTHORITY,
    client_credential=CLIENT_SECRET,
)

# Acquire token
token_response = app.acquire_token_for_client(scopes=SCOPE)
if "access_token" in token_response:
    print("Token acquired!")
    access_token = token_response['access_token']
    # Prepare the email message
    email_payload = {
        "message": {
            "subject": "Test Email from IT Form App",
            "body": {
                "contentType": "Text",
                "content": "This is a test email sent from the IT form app using Microsoft Graph API. Hey just testing the mail.send application."
            },
            "toRecipients": [
            {"emailAddress": {"address": "tflatt@sbsb-eastham.com"}},
            {"emailAddress": {"address": "clowery@sbsb-eastham.com"}} 
            ]
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
        print("Email sent successfully!")
    else:
        print("Failed to send email. Status code:", response.status_code, "Response:", response.text)
else:
    print("Failed to acquire token. Error:", token_response.get('error'), "Error description:", token_response.get('error_description'))
