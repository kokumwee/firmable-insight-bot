import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOutreachCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { count: taskCount, error } = await supabase
        .from('outreach_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('recommended_at', today);

      if (error) throw error;
      setCount(taskCount || 0);
    } catch (error) {
      console.error('Error fetching outreach count:', error);
      setCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();
    
    // Refresh every 10 minutes
    const interval = setInterval(fetchCount, 10 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return { count, loading, refetch: fetchCount };
}
