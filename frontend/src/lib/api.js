import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "https://pesach-api.onrender.com";
export const API = `${BACKEND_URL}/api`;

export const apiClient = axios.create({ baseURL: API });

apiClient.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("auth_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export const setToken = (t) => {
  if (t) localStorage.setItem("auth_token", t);
  else localStorage.removeItem("auth_token");
};

export const getToken = () => localStorage.getItem("auth_token");
