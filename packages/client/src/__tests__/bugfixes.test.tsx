import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../components/auth/LoginPage";
import RegisterPage from "../components/auth/RegisterPage";

// Mock the auth store
const mockLogin = vi.fn();
const mockRegister = vi.fn();

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: { login: typeof mockLogin; register: typeof mockRegister }) => unknown) =>
    selector({ login: mockLogin, register: mockRegister }),
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Bug #3: LoginPage reads .error field from server response", () => {
  it("displays server error message from .error field on login failure", async () => {
    const user = userEvent.setup();

    // Simulate server returning { error: "Invalid credentials" }
    mockLogin.mockRejectedValueOnce({
      response: { data: { error: "Invalid credentials" } },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("does NOT show fallback 'Login failed' when server returns .error", async () => {
    const user = userEvent.setup();

    mockLogin.mockRejectedValueOnce({
      response: { data: { error: "Invalid credentials" } },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
    expect(screen.queryByText("Login failed")).not.toBeInTheDocument();
  });

  it("falls back to 'Login failed' when no error field in response", async () => {
    const user = userEvent.setup();

    mockLogin.mockRejectedValueOnce({
      response: { data: {} },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Login failed")).toBeInTheDocument();
    });
  });
});

describe("Bug #3: RegisterPage reads .error field from server response", () => {
  it("displays server error message from .error field on registration failure", async () => {
    const user = userEvent.setup();

    // Simulate server returning { error: "Email already in use" }
    mockRegister.mockRejectedValueOnce({
      response: { data: { error: "Email already in use" } },
    });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(screen.getByLabelText(/email/i), "dup@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("Email already in use")).toBeInTheDocument();
    });
  });

  it("does NOT show fallback 'Registration failed' when server returns .error", async () => {
    const user = userEvent.setup();

    mockRegister.mockRejectedValueOnce({
      response: { data: { error: "Email already in use" } },
    });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(screen.getByLabelText(/email/i), "dup@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("Email already in use")).toBeInTheDocument();
    });
    expect(screen.queryByText("Registration failed")).not.toBeInTheDocument();
  });

  it("falls back to 'Registration failed' when no error field in response", async () => {
    const user = userEvent.setup();

    mockRegister.mockRejectedValueOnce({
      response: { data: {} },
    });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.type(screen.getByLabelText(/email/i), "dup@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("Registration failed")).toBeInTheDocument();
    });
  });
});
