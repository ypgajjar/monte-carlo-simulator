
# Monte Carlo Project Risk Simulator 🚧📈

A powerful and intuitive web-based tool for performing **project risk simulations** using **Monte Carlo methods**. 
This simulator models schedule and cost uncertainties with **various probability distributions**, supports **task dependencies and lags**, and visualizes outputs through **S-curves, Gantt charts**, and **sensitivity analysis**.

---

## 🔧 Key Features

- 📋 **Task Modeling** with custom WBS, duration, and cost inputs.
- 📊 **Distributions Supported**: Normal, Triangular, and PERT for durations and costs.
- 🔗 **Dependency Types**: FS, SS, FF, SF with lags.
- 🔁 **Monte Carlo Simulation** with user-defined iterations (e.g., 500, 1000, 10,000).
- 📈 **Output Visualizations**:
  - Duration and Cost S-Curves (Cumulative Probability)
  - Tornado Chart (Sensitivity Analysis)
  - Criticality Index & Cruciality Metrics
  - Probabilistic Gantt Chart
- 🎯 **Confidence Level Analysis** for schedule and cost goals.
- 📎 Task input sorted by WBS for easy tracking.
- 💡 All calculations follow AACE standards where applicable.

---

## 🚀 Getting Started

### 📦 Install Dependencies

```bash
npm install
```

### 🧪 Run Locally

```bash
npm start
```

This will start a development server at [http://localhost:3000](http://localhost:3000)

### 🛠 Build for Deployment

```bash
npm run build
```

Optional: Deploy using GitHub Pages

```bash
npm run deploy
```

---

## 📸 Example Use Case

| Task Name       | WBS Code | Distribution | Min | Likely/Mean | Max | Cost Min | Cost Likely | Cost Max | Dependency | Type | Lag |
|----------------|----------|--------------|-----|-------------|-----|----------|--------------|----------|------------|------|-----|
| Project Start  | 1        | Normal       | –   | 10          | 2   | 100      | 120          | 140      | –          | –    | –   |
| Design         | 1.1      | Triangular   | 10  | 15          | 25  | 200      | 250          | 300      | Project Start | FS | 0   |
| Procurement    | 1.2      | Normal       | –   | 12          | 3   | 300      | 320          | 340      | Project Start | SS | 0   |
| Construction   | 2        | PERT         | 20  | 30          | 50  | 1000     | 1100         | 1200     | Design, Procurement | FS | 0   |
| Commissioning  | 3        | Triangular   | 3   | 6           | 9   | 150      | 175          | 200      | Construction | FF | 2   |

---

## 📊 Example Output Screenshots

- Probabilistic Gantt Chart
- Simulation Summary (Mean Duration & Cost)![Output_1](https://github.com/user-attachments/assets/d55f5887-fb42-49ae-8261-5f8111ac0c09)
- S-Curve for Duration and Cost![Output_2](https://github.com/user-attachments/assets/fba91fa4-79a3-49db-a92b-f00ef857aa49)
- Sensitivity Analysis (Tornado Chart)![Output_3](https://github.com/user-attachments/assets/3f4cbeb0-a0df-45fb-8e5a-581975dc8d51)

---

## 📚 Technologies Used

- ReactJS (UI Framework)
- Chart.js (Graphs)
- TailwindCSS (Styling)
- ReactFlow (Network Diagrams)
- Math.js (Probability Calculations)

---

## 🙌 Acknowledgements

Inspired by real-world project planning challenges faced in engineering and construction. Built to support transparent risk communication using data-driven simulations.

---

## 🔗 License

MIT License.
