import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function ShopDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDoc(doc(db, "shops", id));
      if (snap.exists()) {
        setShop(snap.data());
      }
    };
    fetch();
  }, [id]);

  if (!shop) return <p>Loading...</p>;

  return (
    <div>

      <button onClick={() => navigate(-1)}>⬅ Back</button>

      <h2>{shop.name}</h2>

      <div style={card}>
        <p><b>Owner ID:</b> {shop.ownerId}</p>
        <p><b>Plan:</b> {shop.plan}</p>
        <p><b>Status:</b> {shop.status}</p>

        <hr />

        <p><b>Trial:</b> {shop.trial?.isTrial ? "Yes" : "No"}</p>
        <p><b>Trial End:</b> {shop.trial?.endDate?.toDate?.().toString()}</p>
      </div>
    </div>
  );
}

const card = {
  background: "#111",
  color: "#fff",
  padding: "20px",
  borderRadius: "10px",
};