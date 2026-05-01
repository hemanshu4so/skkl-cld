import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export default function EditShop() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [name, setName] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDoc(doc(db, "shops", id));
      if (snap.exists()) {
        setName(snap.data().name);
      }
    };
    fetch();
  }, [id]);

  const handleUpdate = async () => {
    await updateDoc(doc(db, "shops", id), {
      name,
    });

    alert("Updated ✅");
    navigate("/sa/shops");
  };

  return (
    <div>
      <button onClick={() => navigate(-1)}>⬅ Back</button>

      <h2>Edit Shop</h2>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Shop Name"
      /><br /><br />

      <button onClick={handleUpdate}>Update</button>
    </div>
  );
}