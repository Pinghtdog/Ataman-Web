# Ataman Web

Ataman is a comprehensive hospital command center application designed for Naga City. It provides a real-time, unified interface for managing patient flow, clinical data, and facility resources. The system is built to streamline operations, from patient referral and admission to telemedicine and digital charting.

## Core Features

*   **Live Dashboard Overview:** A high-level view of critical hospital metrics, including real-time occupancy rates for different wards and a stream of incoming patient referrals.
*   **Bed Management:** A visual and interactive grid for tracking and managing the status of all hospital beds. Staff can assign patients to available beds, release discharged patients, and mark beds for cleaning.
*   **Referral Center:** A sophisticated module for managing incoming patient referrals. It includes:
    *   Case disposition logic to accept or divert patients.
    *   Service stream assignment (Inpatient, Outpatient, Diagnostic).
    *   Live ambulance GPS tracking on a map (`pigeon-maps`).
    *   A detailed modal for reviewing clinical slips and assigning resources.
*   **Digital Charting:** A secure system for managing patient electronic health records. Features include:
    *   Patient search by name or ID.
    *   QR code scanning for quick patient identification.
    *   Viewing detailed patient profiles, clinical history, and linked family members.
    *   A structured interface for doctors to create new clinical entries using the SOAP (Subjective, Objective, Assessment, Plan) note format.
*   **Telemedicine Hub:** An integrated platform for remote consultations, featuring:
    *   A patient queue and session management.
    *   Secure 1-on-1 video calls powered by **ZegoCloud**.
    *   Live speech-to-text transcription during consultations.
    *   AI-powered summarization of transcripts into clinical SOAP notes using the **Groq API**.
*   **Services & Facilities Management:** A logistics board for monitoring and managing hospital assets. This includes tracking the status and capacity of medical equipment (e.g., X-ray machines) and the inventory levels of consumable supplies (e.g., PPE, medications).
*   **Admin & Settings:** A control panel for system administrators to manage staff roles/permissions and configure system-wide operational rules.

## Tech Stack

*   **Frontend:** React, Vite, Tailwind CSS
*   **Backend & Database:** Supabase (Authentication, Realtime DB, Storage)
*   **Real-time Video:** ZegoCloud UIKit
*   **AI Integration:** Groq SDK (for Llama 3.3)
*   **Mapping:** Pigeon Maps
*   **Routing:** React Router DOM

## Getting Started

To run the project locally, follow these steps.

### Prerequisites

*   Node.js (v18 or later)
*   npm or yarn

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/pinghtdog/ataman-web.git
    cd ataman-web
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the root of the project and add your Supabase, ZegoCloud, and Groq API credentials.

    ```bash
    # .env.local

    # Supabase Credentials
    VITE_SUPABASE_URL= Please ask developers
    VITE_SUPABASE_ANON_KEY= Please ask developers

    # ZegoCloud Credentials for Telemedicine
    VITE_ZEGOCLOUD_APP_ID= Please ask developers
    VITE_ZEGOCLOUD_SERVER_SECRET= Please ask developers

    # Groq API Key for AI note summarization
    VITE_GROQ_API_KEY= Please ask developers
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173` (or another port if 5173 is in use).

## Project Structure

The project follows a standard React application structure.

*   `public/`: Contains static assets like favicons.
*   `src/`: The main application source code.
    *   `assets/`: Images, icons, and other static files.
    *   `components/`: Reusable React components used across multiple pages (e.g., `Sidebar`, `ReferralModal`).
    *   `context/`: React context providers, such as for authentication (`AuthContext`).
    *   `layouts/`: Components that define the main page structures (e.g., `DashboardLayout`).
    *   `lib/`: Utility files and external service configurations (e.g., `supabase.js`).
    *   `pages/`: Top-level components that correspond to specific application routes (e.g., `BedManagement.jsx`, `Telemed.jsx`).
    *   `App.jsx`: The root component that sets up routing.
    *   `main.jsx`: The entry point of the React application.
    *   `supabaseClient.jsx`: The main Supabase client instance.
