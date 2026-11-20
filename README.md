# ⚡ Swayam-Auto (v6.2)

Automated course player & quiz solver for Swayam Plus LMS (Certified Intelligent Data Center-Operations & Maintenance - CIDCOM).

---

## 🌟 Key Features

1. **Dual Solver Modes**:
   - ⚡ **Fast Algorithm Mode (Recommended)**: Instant zero-latency responses using verified H5P question keys & technical domain heuristics.
   - 🤖 **AI Mode**: Real-time integration with Google Gemini AI (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro` with dynamic model auto-discovery).

2. **Complete Video & Interactive H5P Pipeline**:
   - **Auto-Seek**: Seeks long lecture videos to completion.
   - **Quiz Question Solver**: Answers all end-of-video questions (`Quiz qp 1` through `qp 5`) and triggers native `Check` & `Continue` events.
   - **Star & Submit Answers Handler**: Opens the submit summary/endscreen, clicks **Submit Answers**, confirms submission (`"Your answers have been submitted!"`), closes dialog, and clicks **"Click to here enable the Next Video"**.

3. **Moodle Standalone Quiz Automation (`/mod/quiz/*`)**:
   - Auto-clicks **Attempt quiz** / **Re-attempt quiz**.
   - Solves multiple-choice questions across all attempt pages.
   - Automatically navigates via **Next page** and **Finish attempt**.
   - Auto-clicks **Submit all and finish** and confirms the modal dialog.
   - Returns to the course overview seamlessly.

4. **Smart Resume**:
   - Never starts from 0% or gets stuck on informational videos (skips *Introduction Video* Module 918).
   - Scans syllabus and jumps directly to your next unlocked, incomplete lesson.

---

## 📦 Option 1: Chrome Extension (Recommended)

1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
2. Turn ON **Developer mode** in the top right.
3. Click **Load unpacked** (top left).
4. Select the folder:
   ```text
   chrome-extension
   ```
5. Pin the extension to your Chrome toolbar.
6. Open your course on [Swayam Plus](https://swayam-plus-lms.iitmpravartak.org.in/) and enjoy fully automated completion!

---

## 📜 Option 2: Tampermonkey Userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. In Chrome, make sure **Allow User Scripts** is enabled under Tampermonkey extension settings (`chrome://extensions`).
3. Create a new script in Tampermonkey, copy & paste the contents of [`swayam-auto.user.js`](./swayam-auto.user.js), and save (`Ctrl + S`).
4. Navigate to Swayam Plus LMS.

---

## 📄 License

MIT
