<div align="center">

#RentDrive

**Car Rental Booking & Management System**

A full-stack car rental platform built with **Node.js, Express.js, EJS, and MongoDB**.

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-Web_Framework-303030?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?logo=mongodb&logoColor=white)
![EJS](https://img.shields.io/badge/EJS-Server--Rendered_UI-B4CA65)
![Status](https://img.shields.io/badge/Status-Project_Demo-2684A7)

**[Overview](#1-project-information)** · **[Features](#main-features)** · **[Setup](#installation-and-configuration)** · **[CRUD Web Pages](#crud-web-page-guide)** · **[REST API](#restful-api-guide)**

</div>

---

## 1. Project Information

### Project name and purpose

**RentDrive** is a Hong Kong car rental booking and management website. Customers can browse different vehicle categories, filter available cars, review rental details, choose dates, and manage bookings. Authorized administrators manage cars, reservations, and regular members through dedicated web pages.

The system is implemented as a server-side Express.js application. EJS templates render the interface, while the MongoDB Node.js driver stores and retrieves the application data.

### Main features

| Audience | Feature | Description |
| --- | --- | --- |
| Visitor | Browse cars | Explore private, family, electric, and luxury vehicles. |
| Visitor | Search and filter | Filter by category, location, brand, model, seats, price, and related criteria. |
| Member | Register, log in, log out | User accounts with password hashing and cookie-based sessions. |
| Member | Make a booking | Choose pickup/return dates and view the estimated total rental cost. |
| Member | Availability checking | Reject overlapping confirmed bookings for the same car. |
| Member | My Bookings | View booking records and cancel eligible future bookings. |
| Administrator | Car management | Create, search, view, update, and delete cars through web pages. |
| Administrator | Booking management | Search/view bookings and cancel eligible future reservations. |
| Administrator | Member management | Create, search, view, edit, and delete eligible regular-member accounts. |
| API client | RESTful vehicle CRUD | Use HTTP GET, POST, PUT, and DELETE endpoints. |

> **Data protection rules:** The web admin tools prevent direct deletion of cars or members with existing booking history. The booking cancellation action preserves the booking document and changes its status. Accounts with administrator privileges are excluded from ordinary member management.

### Technology stack

- **Runtime:** Node.js
- **Web framework:** Express.js
- **Template engine:** EJS, HTML, CSS, and browser-side JavaScript
- **Database:** MongoDB using the official `mongodb` Node.js driver
- **Authentication:** `express-session` with `bcryptjs` password hashes
- **Configuration:** `dotenv` for environment variables
- **Development/deployment:** GitHub Codespaces or a compatible Node.js server

### Database collections

| Collection | Purpose | Example fields |
| --- | --- | --- |
| `cars` | Vehicle inventory | `brand`, `model`, `category`, `pricePerDay`, `available`, `image` |
| `users` | Accounts and authorization | `name`, `email`, `passwordHash`, `role`, `createdAt` |
| `bookings` | Rental reservations | `userId`, `carId`, `pickupDate`, `returnDate`, `status`, `totalPrice` |

Vehicle images are referenced with paths such as `/images/car05.jpg` and are served from `public/images/`. A separate external car API is not required for the demo inventory.

---

## 2. Group Information

> **Complete this section with the group's actual information before submission.** Do not claim contributions that a member did not make.

**Course:** COMP 3810SEF — Group Project, Autumn 2026  
**Group number:** `[ENTER GROUP NUMBER]`

| Member | Student ID | Role / Workload division | Contribution |
| --- | --- | --- | --- |
| `[Member 1 name]` | `[SID]` | `[e.g., Server-side development]` | `[Actual work completed]` |
| `[Member 2 name]` | `[SID]` | `[e.g., MongoDB and data]` | `[Actual work completed]` |
| `[Member 3 name]` | `[SID]` | `[e.g., Front-end UI and EJS]` | `[Actual work completed]` |
| `[Member 4 name]` | `[SID]` | `[e.g., Testing and documentation]` | `[Actual work completed]` |
| `[Member 5 name, if applicable]` | `[SID]` | `[Actual role]` | `[Actual work completed]` |
| `[Member 6 name, if applicable]` | `[SID]` | `[Actual role]` | `[Actual work completed]` |

---

## 3. Project File Introduction

### Suggested project structure

```text
comp3810sef_groupNo/
├── server.js                     # Express routes, authentication, business logic, MongoDB
├── package.json                  # Node.js package metadata, dependencies and npm scripts
├── package-lock.json             # Dependency lockfile, if present
├── .env.example                  # Sample environment variable names (no secrets)
├── README.md                     # Project information and operating guides
├── public/
│   ├── css/                      # CSS assets, if separated from the templates
│   ├── js/                       # Browser-side scripts, if any
│   └── images/                   # Vehicle photos and static images
└── views/
    ├── index.ejs                 # Home page
    ├── cars.ejs                  # Vehicle listing and filtering
    ├── car-detail.ejs            # Car details and date-selection form
    ├── register.ejs              # Registration form
    ├── login.ejs                 # Login form
    ├── my-booking.ejs            # Customer's booking history
    ├── booking-confirmation.ejs  # Booking confirmation
    ├── admin-cars.ejs            # Admin vehicle table and search
    ├── admin-car-new.ejs         # Admin create vehicle form
    ├── admin-car-edit.ejs        # Admin update vehicle form
    ├── admin-bookings.ejs        # Admin booking list
    ├── admin-booking-detail.ejs  # Admin booking details
    ├── admin-users.ejs           # Admin member list
    ├── admin-user-detail.ejs     # Admin member details
    └── admin-user-form.ejs       # Admin create/edit member form
```

The above `views/` entries correspond to templates referenced by the supplied `server.js`. Keep only files that are actually present in the submitted project. A `models/` directory is **not required**, because the application uses the MongoDB driver directly rather than separate Mongoose model files.

### Main files

**`server.js`** initializes Express, configures EJS/static resources/sessions, connects to MongoDB, creates indexes, checks user/admin access, performs rental-date validation, handles bookings, exposes admin web pages, and implements the four required REST methods.

**`package.json`** declares npm dependencies and run scripts. The application imports the following third-party packages:

| Dependency | Purpose |
| --- | --- |
| `express` | Web server and HTTP routes |
| `ejs` | HTML templates |
| `mongodb` | MongoDB connectivity and queries |
| `bcryptjs` | Password hashing and verification |
| `express-session` | Login session handling |
| `dotenv` | Load `.env` settings |

**`public/`** stores vehicle images and any other public-facing CSS/JavaScript/assets. **`views/`** stores EJS templates. Node.js built-ins such as `path` and `crypto` do not require separate installation.

### Installation and configuration

**Requirements:** Node.js (20+ recommended), npm, and an accessible MongoDB database (for example MongoDB Atlas). The database needs collections named `cars`, `users`, and `bookings`; collections may be created automatically when data is inserted.

1. Open the project in GitHub Codespaces or another Node.js environment.
2. Install dependencies from the project's package manifest:

   ```bash
   npm install
   ```

   If using an older course starter `package.json` that does not list every imported library, install the missing modules and commit the updated manifest:

   ```bash
   npm install express ejs mongodb bcryptjs express-session dotenv
   ```

3. Copy the environment template and fill in your own MongoDB URI and session secret:

   ```bash
   cp .env.example .env
   ```

   ```dotenv
   PORT=3000
   DB_NAME=car_rental_db
   MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@YOUR_CLUSTER/YOUR_DATABASE
   SESSION_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
   ```

   To generate a session secret, you can run:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Start the application:

   ```bash
   npm start
   # or: node server.js
   ```

5. Open `http://localhost:3000/`, or open the forwarded port **3000** in GitHub Codespaces.

**Never commit `.env`, genuine demo-account passwords, connection credentials, or production database secrets.** For assessment, use a disposable demo database and explicitly authorized test accounts.

---

## 4. Operation Guides

### Login / logout guide

| Account type | Login email | Password | Purpose |
| --- | --- | --- | --- |
| Administrator | `[FILL: TEST ADMIN EMAIL]` | `[FILL: TEST ADMIN PASSWORD]` | Admin CRUD demonstrations |
| Ordinary member | `[FILL: TEST MEMBER EMAIL]` | `[FILL: TEST MEMBER PASSWORD]` | Customer booking demonstrations |

> Fill these cells with **valid, test-only credentials** for the private assessor submission, or provide them through a separate secure channel. No credentials are hardcoded in the supplied source. Admin permission is checked from the `users.role` value in MongoDB.

**Sign-in flow:**

1. Visit `/register` to register a normal customer account, or use a prepared test account.
2. Open `/login` and enter the registered email and password.
3. A normal customer is sent to `/`; an administrator is sent to `/admin` and then redirected to `/admin/cars`.
4. Click **Logout / 登出** to end the session. The server destroys the session and clears the `rentdrive.sid` Cookie.
5. Unauthenticated visitors cannot enter protected pages. Non-admin users are denied access to `/admin/...`.

### Customer booking flow

1. Open `/` or `/cars` to browse available vehicles.
2. Choose a vehicle and open `/cars/:id` to see its photo, specifications, price, and rental form.
3. Select a valid future pickup date and a later return date.
4. Sign in if necessary, then confirm the booking. Rental days and the total cost are calculated from the selected dates and vehicle price.
5. Open `/my-booking` to see the customer's bookings. Eligible future **confirmed** reservations can be cancelled; the record remains in MongoDB with status `cancelled`.

### CRUD web page guide

Only an authenticated **administrator** can access the administrative CRUD pages.

| Operation | Web page | Button / action | MongoDB effect |
| --- | --- | --- | --- |
| **Create** | `/admin/cars/new` | **+ 新增車輛 / Save Car** | Insert a document in `cars` |
| **Read** | `/admin/cars` | **Search / Reset / View** | Query vehicle documents |
| **Update** | `/admin/cars/:id/edit` | **Edit / Save Changes** | Update the car document |
| **Delete** | `/admin/cars` | **Delete / Confirm** | Remove a car with no booking history |
| Read bookings | `/admin/bookings` | **Search / Status / Details** | Read booking documents and member display info |
| Cancel booking | `/admin/bookings/:id` | **Cancel** | Set an eligible future booking's status to `cancelled` |
| Manage members | `/admin/users` | **Search / Details / Edit / 新增會員** | Query, insert, and update regular users |
| Delete member | Member details page | **Delete** (only if eligible) | Delete a regular member with no bookings |

For safety, deleting a vehicle or member that has a booking record is blocked. Existing admin accounts are not editable/deletable through the ordinary member-management page. Logout is available to authorized users from the application interface.

### RESTful API guide

All routes below are provided by the supplied `server.js` and return JSON. The course specification allows REST services without authentication; these endpoints are for a **controlled classroom demonstration**, not an internet-facing production deployment.

| Method | URI | Operation | Normal success |
| --- | --- | --- | --- |
| `GET` | `/api/cars` | Read all vehicle documents | `200 OK` |
| `POST` | `/api/cars` | Create a demonstration vehicle | `201 Created` |
| `PUT` | `/api/cars/:id` | Update a vehicle's daily rental price | `200 OK` |
| `DELETE` | `/api/cars/:id` | Delete a matching inactive demonstration vehicle | `200 OK` |

**Important restriction of this demo API:** `DELETE` deliberately only deletes cars whose `brand` is `TestBrand`, `model` is `CRUD Demo Car`, and `available` is `false`. The admin **web** Delete action has its own booking-history safety rule.

### Ready-to-run CURL demo

Execute the following in a terminal while the server is running. Each request uses the same application instance and MongoDB database.

**1. GET — read cars**

```bash
curl -i http://localhost:3000/api/cars
```

**2. POST — create a safe demonstration car**

```bash
curl -i -X POST http://localhost:3000/api/cars \
  -H 'Content-Type: application/json' \
  -d '{"brand":"TestBrand","model":"CRUD Demo Car","category":"private","pricePerDay":100}'
```

Record the `carId` from the JSON response. Or create a new test record and capture its ID automatically:

```bash
CAR_ID=$(curl -fsS -X POST http://localhost:3000/api/cars \
  -H 'Content-Type: application/json' \
  -d '{"brand":"TestBrand","model":"CRUD Demo Car","category":"private","pricePerDay":100}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["carId"])')
echo "Demo car ID: $CAR_ID"
```

**3. PUT — change the test car's daily price**

```bash
curl -i -X PUT "http://localhost:3000/api/cars/$CAR_ID" \
  -H 'Content-Type: application/json' \
  -d '{"pricePerDay":200}'
```

**4. DELETE — remove the test car**

```bash
curl -i -X DELETE "http://localhost:3000/api/cars/$CAR_ID"
```

**5. GET — verify the inventory remains accessible**

```bash
curl -i http://localhost:3000/api/cars
```

Do not run DELETE against a real inventory record. For the demo above, a successful removal returns a JSON message and `deletedCount: 1`. If you manually run the POST command and the automatic-ID command, you create two test records: delete each by its own ID when finished.

### Troubleshooting

| Problem | Check |
| --- | --- |
| Server will not start | Make sure `MONGODB_URI`, `DB_NAME`, and `SESSION_SECRET` exist in `.env`. |
| `Cannot find module` | Run `npm install`, then install any missing imported dependency. |
| Admin page returns 403 | Sign in with an actual `role: "admin"` account. |
| Vehicle images are missing | Confirm that the specified `/images/...` file exists under `public/images/`. |
| Booking cannot be confirmed | Check the dates, vehicle `available` status, and any overlapping confirmed booking. |
| API returns 400 | Check required JSON data types and whether `:id` is a valid 24-character ObjectId. |
| Test-car DELETE returns 404 | Confirm the record has the allowed test brand/model, is unavailable, and has not already been deleted. |

### Functional verification checklist

- [ ] User registration, sign-in, and logout
- [ ] Regular user cannot access `/admin/cars`
- [ ] Admin can search and view car records
- [ ] Admin can create, edit, and delete an eligible test car
- [ ] Booking creation and overlapping-date rejection
- [ ] Booking history and future-only cancellation
- [ ] Admin booking list, details, and cancellation
- [ ] Admin member list, details, and editing
- [ ] REST `GET`, `POST`, `PUT`, and `DELETE` demonstrated with CURL
- [ ] All visible website branding reads **RentDrive**

---

## Submission Notes

The course requires the deliverable project folder to be named `comp3810sef_groupNo` (replace `groupNo` with the real group number), and the submitted ZIP to be named `comp3810sef_groupNo.zip`. Include `server.js`, `package.json`, `README.md`, and all required `views/` and `public/` resources. **Do not include `node_modules/` or `.env`.** Keep a working copy of the application and prepare CURL commands for the presentation.

**Reminder:** Every team member should review and understand the parts they claim to have implemented. Record genuine individual contributions in the group-information table above.

---

<sub>README layout uses straightforward headings, badges, installation steps, and usage guidance, taking structural inspiration from [jstrieb/github-stats](https://github.com/jstrieb/github-stats). GitHub statistics generation is not part of RentDrive's runtime.</sub>
