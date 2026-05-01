import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function ShopsList() {
  const [shops, setShops] = useState([]);
  const navigate = useNavigate();

  const fetchShops = async () => {
    const snap = await getDocs(collection(db, "shops"));
    const data = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    setShops(data);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this shop?")) return;
    await deleteDoc(doc(db, "shops", id));
    fetchShops();
  };

  useEffect(() => {
    fetchShops();
  }, []);

  return (
    <div>
      <h2 style={title}>🏪 All Shops</h2>

      <div style={grid}>
        {shops.map((shop) => (
          <div key={shop.id} style={card}>
            
            <h3>{shop.name}</h3>
            <p style={sub}>ID: {shop.id.slice(0, 8)}...</p>

            <div style={row}>
              <button
                style={btnView}
                onClick={() => navigate(`/sa/shop/${shop.id}`)}
              >
                View
              </button>

              <button
                style={btnEdit}
                onClick={() => navigate(`/sa/edit-shop/${shop.id}`)}
              >
                Edit
              </button>

              <button
                style={btnDelete}
                onClick={() => handleDelete(shop.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const title = { marginBottom: "20px" };

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: "20px",
};

const card = {
  background: "#111",
  padding: "20px",
  borderRadius: "12px",
  color: "#fff",
};

const sub = {
  fontSize: "12px",
  color: "#aaa",
  marginBottom: "15px",
};

const row = {
  display: "flex",
  gap: "8px",
};

const btnView = {
  flex: 1,
  background: "#00c853",
  color: "#fff",
  border: "none",
  padding: "8px",
  borderRadius: "6px",
};

const btnEdit = {
  flex: 1,
  background: "#2962ff",
  color: "#fff",
  border: "none",
  padding: "8px",
  borderRadius: "6px",
};

const btnDelete = {
  flex: 1,
  background: "#ff3d00",
  color: "#fff",
  border: "none",
  padding: "8px",
  borderRadius: "6px",
};