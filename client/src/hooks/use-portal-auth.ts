import { useQuery } from "@tanstack/react-query";

type PortalUser = {
  employeeId: string;
  name: string;
};

export function usePortalAuth() {
  const { data, isLoading } = useQuery<PortalUser | null>({
    queryKey: ["/api/portal/me"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000,
    retry: false,
  });

  return {
    employeeId: data?.employeeId || null,
    employeeName: data?.name || localStorage.getItem("portal_employee_name") || "Employee",
    isLoading,
    isAuthenticated: !!data,
  };
}
