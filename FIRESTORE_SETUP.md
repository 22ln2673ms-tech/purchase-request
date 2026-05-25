# Firebase Firestore Integration Guide

## Overview
Your Purchase Request system now has Firestore integration for persistent data storage. All user authentication is backed by Firestore, and all purchase requests are stored in the cloud database.

## Database Structure

### Collections

#### 1. `users/` Collection
Stores user profiles and their roles.

**Document Structure:**
```json
{
  "uid": "string (user ID from Firebase Auth)",
  "email": "string",
  "displayName": "string",
  "role": "admin | user",
  "office": "string (e.g., 'LHIO Ilocos Norte')",
  "createdAt": "timestamp",
  "lastLoginAt": "timestamp",
  "isActive": "boolean"
}
```

**Auto-created:** When a user signs in for the first time
**Permissions:** Users can only read/write their own profile (set in Firestore Security Rules - see section below)

---

#### 2. `purchaseRequests/` Collection
Stores all purchase request documents.

**Document Structure:**
```json
{
  "id": "string (auto-generated)",
  "itemName": "string",
  "quantity": "number",
  "unitPrice": "number",
  "totalPrice": "number",
  "createdBy": {
    "uid": "string",
    "email": "string",
    "name": "string",
    "role": "string",
    "office": "string"
  },
  "createdAt": "timestamp",
  "updatedAt": "timestamp",
  "status": "draft | submitted | approved | rejected",
  "office": "string"
}
```

**Access:**
- Admins can see all requests
- Standard users see only requests from their office

---

#### 3. `auditLog/` Collection
Tracks all user actions for security and compliance.

**Document Structure:**
```json
{
  "action": "string (e.g., 'user_signin', 'user_signout', 'request_created')",
  "details": "object",
  "userId": "string",
  "userEmail": "string",
  "userRole": "string",
  "userOffice": "string",
  "timestamp": "timestamp"
}
```

---

## Available Functions

### Authentication Functions

#### `saveUserProfileToFirestore(user)`
Automatically saves user profile when they sign in.
- **Called automatically** when user authenticates
- Creates/updates user record in the `users` collection

#### `logAuditEvent(action, details)`
Logs user actions for audit trail.
- **Parameters:**
  - `action` (string): Action type (e.g., 'user_signin', 'request_created')
  - `details` (object): Additional information about the action
- **Example:**
  ```javascript
  logAuditEvent('request_created', { requestId: '123', office: 'LHIO Ilocos Norte' });
  ```

---

### Purchase Request Functions

#### `savePurchaseRequestToFirestore(requestData)`
Saves a new purchase request to Firestore.

- **Parameters:**
  - `requestData` (object): The purchase request data
- **Returns:** Document ID (string) or null if error
- **Example:**
  ```javascript
  const requestId = await savePurchaseRequestToFirestore({
    itemName: 'Medical Supplies',
    quantity: 100,
    unitPrice: 50.00,
    totalPrice: 5000.00,
    status: 'draft'
  });
  ```

---

#### `updatePurchaseRequestInFirestore(requestId, updates)`
Updates an existing purchase request.

- **Parameters:**
  - `requestId` (string): ID of the request to update
  - `updates` (object): Fields to update
- **Returns:** true/false
- **Example:**
  ```javascript
  const success = await updatePurchaseRequestInFirestore('doc123', {
    status: 'submitted',
    quantity: 150
  });
  ```

---

#### `getPurchaseRequestsForUser()`
Retrieves all purchase requests the current user can access.

- **Returns:** Array of request objects
- **Behavior:**
  - Admins: see all requests
  - Standard users: see only requests from their office
- **Example:**
  ```javascript
  const requests = await getPurchaseRequestsForUser();
  console.log(requests);
  ```

---

#### `getPurchaseRequestById(requestId)`
Retrieves a specific purchase request by ID.

- **Parameters:**
  - `requestId` (string): ID of the request
- **Returns:** Request object or null
- **Example:**
  ```javascript
  const request = await getPurchaseRequestById('doc123');
  ```

---

## Firestore Security Rules

These rules should be set in the Firebase Console to protect your data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users collection - users can read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId || isAdmin();
    }
    
    // Purchase Requests collection
    match /purchaseRequests/{requestId} {
      // Admins can read all, everyone else see their office only
      allow read: if isAdmin() || 
                     request.auth.token.email in [
                       'admin.pro1@gov.ph',
                       'lhio.ilocossur@gov.ph',
                       'lhio.ilocosnorte@gov.ph',
                       'lhio.launion@gov.ph',
                       'lhio.westpang@gov.ph',
                       'lhio.eastpang@gov.ph',
                       'lhio.cenpang@gov.ph'
                     ];
      
      // Users can create their own requests
      allow create: if request.auth != null &&
                       request.resource.data.createdBy.uid == request.auth.uid;
      
      // Users can update only their own drafts or if admin
      allow update: if isAdmin() || 
                       (resource.data.createdBy.uid == request.auth.uid && 
                        resource.data.status == 'draft');
      
      // Only admins can delete
      allow delete: if isAdmin();
    }
    
    // Audit Log collection - only admin can read
    match /auditLog/{logId} {
      allow write: if request.auth != null;
      allow read: if isAdmin();
    }
    
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth.token.email == 'admin.pro1@gov.ph';
    }
  }
}
```

**⚠️ Important:** Copy these rules to Firebase Console → Firestore → Rules before going to production.

---

## How to Integrate with Your Form

When saving a purchase request from your form:

```javascript
// When user clicks "Save" on the purchase form
document.getElementById('saveRequestBtn').addEventListener('click', async function() {
  const formData = {
    itemName: document.getElementById('itemName').value,
    quantity: parseInt(document.getElementById('quantity').value),
    unitPrice: parseFloat(document.getElementById('unitPrice').value),
    totalPrice: parseFloat(document.getElementById('totalPrice').value),
    status: 'draft'
  };
  
  const requestId = await savePurchaseRequestToFirestore(formData);
  if (requestId) {
    alert('Request saved! ID: ' + requestId);
    logAuditEvent('request_created', { requestId: requestId });
  }
});
```

---

## Next Steps

### Phase 2: User Management Admin Panel
When you're ready, you can create an admin panel to:
- ✅ Create new user accounts
- ✅ Assign roles (admin/user)
- ✅ Enable/disable accounts
- ✅ View audit logs

Use the Firebase Admin SDK for backend operations, or build a UI that lets admins create accounts through a secure form.

### Phase 3: Advanced Features
- Implement approval workflow
- Add document uploads (Firebase Storage)
- Create reports and analytics
- Set up email notifications

---

## Testing Your Setup

1. **Sign in** with one of your test accounts (e.g., `admin.pro1@gov.ph`)
2. **Create a purchase request** and click Save
3. **Check Firestore Console** to see the data in real-time
4. **Switch users** and verify role-based access control

---

## Troubleshooting

### "Firestore not available"
- Check that Firestore SDK is loaded in HTML (should see `firebase-firestore-compat.js`)
- Verify Firebase config is correct in `script.js`

### "Permission denied" errors
- Check Firestore Security Rules in Firebase Console
- Verify your email is in the approved users list
- Make sure rules match the code in this guide

### Data not appearing
- Check browser console for errors (press F12)
- Verify Firestore database is created in Firebase Console
- Check that Security Rules are correct

---

## Resources

- Firebase Docs: https://firebase.google.com/docs/firestore
- Authentication: https://firebase.google.com/docs/auth
- Security Rules: https://firebase.google.com/docs/firestore/security/start
