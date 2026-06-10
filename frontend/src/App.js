import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { IntakeForm, Confirmation } from "@/pages/IntakeForm";
import StaffLogin from "@/pages/StaffLogin";
import Dashboard from "@/pages/Dashboard";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<IntakeForm />} />
          <Route path="/confirmation" element={<Confirmation />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/staff" element={<Dashboard />} />
          <Route path="*" element={<IntakeForm />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
