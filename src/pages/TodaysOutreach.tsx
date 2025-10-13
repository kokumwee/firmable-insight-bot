import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function TodaysOutreach() {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate('/customers?tab=outreach', { replace: true });
  }, [navigate]);

  return null;
}