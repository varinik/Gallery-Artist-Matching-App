import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.signOut();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.user || !data.session) {
      setLoading(false);
      Alert.alert(
        "Login failed",
        "No account found with that email and password.",
      );
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", data.user.id)
      .single();

    setLoading(false);

    if (!profile) {
      router.replace("/new_user");
      return;
    }

    router.replace(
      profile.user_type === "gallery"
        ? "/gallery_dashboard"
        : "/artist_dashboard",
    );
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert("Enter your email first");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "myapp://reset-password",
    });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    Alert.alert("Check your email", "We sent you a password reset link.");
  };

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          {/* TITLE */}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Welcome</Text>
            <Text style={styles.subtitle}>Connect artists with galleries</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#a89a8e"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#a89a8e"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secureTextEntry
          />

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || loading) && { opacity: 0.75 },
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? "Signing in…" : "Log In"}
            </Text>
          </Pressable>

          {/* SIGN UP */}
          <Pressable onPress={() => router.push("/signup")}>
            <Text style={styles.forgotText}>New here? Create an account</Text>
          </Pressable>

          <Pressable onPress={handleResetPassword} disabled={loading}>
            <Text style={styles.newText}>Forgot password?</Text>
          </Pressable>
        </View>

        {/* SEPARATOR */}
        <Image
          source={require("@/assets/images/seperator.png")}
          style={styles.separator}
          resizeMode="contain"
        />
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  background: { flex: 1 },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },

  titleBlock: {
    alignItems: "center",
    marginBottom: 32,
  },

  title: {
    fontFamily: "Euphoria",
    fontSize: 50,
    fontWeight: "bold",
    color: "#4d4139",
  },

  subtitle: {
    fontSize: 15,
    color: "#7c6f63",
    letterSpacing: 0.4,
    marginTop: 4,
  },

  card: {
    width: "100%",
    backgroundColor: "#b2ac88b9",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#3a332c",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 12,
    backgroundColor: "white",
  },

  primaryButton: {
    width: "100%",
    height: 50,
    backgroundColor: "black",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  newText: {
    textAlign: "center",
    marginTop: 14,
    color: "#7c6f63",
    fontSize: 13,
    textDecorationLine: "underline",
  },

  forgotText: {
    textAlign: "center",
    marginTop: 14,
    color: "#7c6f63",
    fontSize: 13,
    textDecorationLine: "underline",
  },

  separator: {
    width: 260,
    height: 22,
    marginVertical: 24,
  },

  secondaryButton: {
    width: "100%",
    height: 50,
    backgroundColor: "transparent",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "black",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "black",
    fontSize: 15,
    fontWeight: "600",
  },
});
