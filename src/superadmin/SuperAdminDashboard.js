import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";

export default function SuperAdminDashboard() {
  const [totalShops, setTotalShops] = useState(0);
  const [totalOwners, setTotalOwners] = useState(0);

  const fetchData = async () => {
    try {
      // 🔥 Get Shops
      const shopSnap = await getDocs(collection(db, "shops"));
      setTotalShops(shopSnap.size);

      // 🔥 Get Users (filter admin only)
      const userSnap = await getDocs(collection(db, "users"));

      let owners = 0;
      userSnap.forEach((doc) => {
        const data = doc.data();
        if (data.role === "admin") {
          owners++;
        }
      });

      setTotalOwners(owners);

    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div>
      <h1>🚀 Super Admin Panel</h1>
      <p>Control entire CRM system from here</p>

      <div style={container}>
        
        <div style={card}>
          <h3>Total Shops</h3>
          <p style={value}>{totalShops}</p>
        </div>

        <div style={card}>
          <h3>Total Owners</h3>
          <p style={value}>{totalOwners}</p>
        </div>

        <div style={card}>
          <h3>Active Plans</h3>
          <p style={value}>0</p>
        </div>

      </div>
    </div>
  );
}

const container = {
  display: "flex",
  gap: "20px",
  marginTop: "20px"
};

const card = {
  background: "#1a1a1a",
  padding: "20px",
  borderRadius: "10px",
  width: "200px",
  color: "#fff"
};

const value = {
  fontSize: "28px",
  fontWeight: "bold",
  marginTop: "10px"
};