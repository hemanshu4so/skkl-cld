import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";

export default function Plans() {
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    const snap = await getDocs(collection(db, "plans"));
    const data = snap.docs.map(d => d.data());
    setPlans(data);
  };

  return (
    <div>
      <h2>Plans</h2>

      {plans.map((p, i) => (
        <div key={i} style={card}>
          <h3>{p.name}</h3>
          <p>₹ {p.price}</p>

          <p>Users: {p.limits.users}</p>
        </div>
      ))}
    </div>
  );
}

const card = {
  background: "#111",
  color: "#fff",
  padding: "20px",
  marginBottom: "10px"
};