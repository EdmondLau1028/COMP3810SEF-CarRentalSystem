# DriveEase Car Rental System

## 1. Project Info

**Project name:** DriveEase Car Rental System

This is a server-side car rental application. Users can browse cars, register/login, and make bookings. Authorized users can manage car data through CRUD web pages. The system also provides RESTful CRUD APIs.

## 2. Group Info

**Group number:** Group 76

**Members:**

| Name | SID | Role |
|------|-----|------|
| Student A | 12345678 | Backend / server.js / REST API |
| Student B | 23456789 | Login & Session / Auth pages |
| Student C | 34567890 | CRUD web pages / EJS views |
| Student D | 23456789 | Login & Session / Auth pages |
| Student E | 34567890 | CRUD web pages / EJS views |
| Student F | 45678901 | Database / Booking feature / README |

## 3. Project File Intro

- **server.js:** Express app entry point. Handles login/logout, car CRUD pages, booking, and RESTful APIs. Connects to MongoDB.
- **package.json:** Lists dependencies (express, mongodb, ejs, express-session) and the start script.
- **public:** Static CSS, images, and client-side files.
- **views:** EJS templates for all web pages.

## 4. Operation Guides

### 4.1 Login / Logout

1. Open http://localhost:3000/register to create an account.
2. Open http://localhost:3000/login to sign in.
3. After login, you can access Manage Cars and My Booking.
4. Click Log out on the navigation bar to sign out.

**Sample account (create one first):**
- Email: demo@test.com
- Password: 123456

### 4.2 CRUD Web Pages

Go to http://localhost:3000/manage-cars (login required).

| Action | How to use |
|--------|------------|
| Create | Click "Add a car" -> fill the form -> submit |
| Read / Search | Use search box / category / availability filters |
| Update | Click "Edit" on a car -> change fields -> submit |
| Delete | Click "Delete" on a car |

### 4.3 RESTful CRUD Services

Base URL: http://localhost:3000

| Method | URI | Description |
|--------|-----|-------------|
| GET | /api/cars | Get / search all cars |
| GET | /api/cars/:carId | Get one car by carId |
| POST | /api/cars | Create a car |
| PUT | /api/cars/:carId | Update a car |
| DELETE | /api/cars/:carId | Delete a car |

**CURL testing commands:**

# Read - list all cars
curl http://localhost:3000/api/cars

# Create - add a car
curl -X POST http://localhost:3000/api/cars -H "Content-Type: application/json" -d "{\"carId\":\"CAR999\",\"name\":\"Test Car\",\"brand\":\"Toyota\",\"category\":\"Sedan\",\"seats\":5,\"transmission\":\"Automatic\",\"fuel\":\"Petrol\",\"pricePerDay\":400,\"available\":true}"

# Update - edit a car
curl -X PUT http://localhost:3000/api/cars/CAR999 -H "Content-Type: application/json" -d "{\"carId\":\"CAR999\",\"name\":\"Updated Car\",\"brand\":\"Toyota\",\"category\":\"Sedan\",\"seats\":5,\"transmission\":\"Automatic\",\"fuel\":\"Petrol\",\"pricePerDay\":450,\"available\":true}"

# Delete - remove a car
curl -X DELETE http://localhost:3000/api/cars/CAR999
