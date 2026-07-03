import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  Image,
  Alert,
  View,
  TextInput,
  ScrollView,
} from "react-native";
import * as FileSystem from "expo-file-system";
import { useState } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";

export default function NewUserScreen() {
  const router = useRouter();
  // ✅ QUESTION BANK (STATIC CONFIG)
  const QUESTION_BANK = {
    artist: [
      { key: "art_type", label: "What type of art do you create?" },
      {
        key: "years_experience",
        label: "How many years have you been creating art?",
      },
    ],
    gallery: [
      { key: "gallery_name", label: "What is your gallery name?" },
      { key: "location", label: "Where is your gallery located?" },
    ],
  };

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const DEFAULT_PROFILE_PIC =
    "https://hbclccxsfpljckxyyrtl.supabase.co/storage/v1/object/sign/profile_pic/profile_upload_7.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9jNmFlNmM4OS1iMTYwLTRhMmItYTdhMy1hNTY2Y2MyYWNkZDIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcm9maWxlX3BpYy9wcm9maWxlX3VwbG9hZF83LnBuZyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODMwMzA2ODAsImV4cCI6MTgxNDU2NjY4MH0.OytnjLGWk317f4muQk5orJdF0-WQa2DWfPz4vpWiDp8";

  const [profile_pic, setImage] = useState<string>(DEFAULT_PROFILE_PIC);
  const [userType, setUserType] = useState<"artist" | "gallery" | null>(null);

  // ✅ ANSWERS STATE (DYNAMIC)
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleAnswerChange = (key: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCreateProfile = async () => {
    if (!username || !password || !userType || !email) {
      Alert.alert("Missing fields");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      Alert.alert("Auth error", error.message);
      return;
    }

    const userId = data.user?.id;

    if (!userId) {
      Alert.alert("User creation failed");
      return;
    }

    // ✅ DEFAULT IMAGE (fallback)
    let profileImageUrl = DEFAULT_PROFILE_PIC;

    // 🔥 UPLOAD IF USER PICKED IMAGE
    if (profile_pic) {
      const uploadedUrl = await uploadProfileImage(profile_pic, userId);
      if (uploadedUrl) {
        profileImageUrl = uploadedUrl;
      }
    }
    // 💾 SAVE PROFILE
    const { error: profileError } = await supabase.from("profiles").insert([
      {
        id: userId,
        username,
        user_type: userType,
        profile_pic: profileImageUrl,
        answers,
      },
    ]);

    if (profileError) {
      Alert.alert("Profile error", profileError.message);
      return;
    }

    router.replace("/");
  };

  const uploadProfileImage = async (uri: string, userId: string) => {
    try {
      const filePath = `avatars/${userId}.jpg`;

      // Convert image to base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 → Uint8Array (Supabase friendly)
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);

      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);

      const { error } = await supabase.storage
        .from("profile_pic")
        .upload(filePath, byteArray, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (error) {
        console.log("Upload error:", error.message);
        return null;
      }

      const { data } = supabase.storage
        .from("profile_pic")
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (err) {
      console.log("Upload failed:", err);
      return null;
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      alert("Permission needed to access photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <ScrollView contentContainerStyle={styles.container}>
        {/* BACK BUTTON */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Image
            source={require("@/assets/images/arrow.png")}
            style={{ width: 80, height: 20 }}
          />
        </Pressable>

        {/* TITLE */}
        <Text style={styles.title}>Create Profile</Text>

        {/* PROFILE IMAGE */}
        <Pressable onPress={pickImage} style={styles.imageWrapper}>
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: profile_pic }}
              style={[
                styles.profileImage,
                profile_pic === DEFAULT_PROFILE_PIC
                  ? styles.defaultImageStyle
                  : styles.userImageStyle,
              ]}
              resizeMode="cover"
            />
          </View>

          <View style={styles.plusButton}>
            <Image
              source={require("@/assets/images/plus_sign.png")}
              style={{ width: 60, height: 60 }}
              resizeMode="cover"
            />
          </View>
        </Pressable>

        {/* BASIC INPUTS */}
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {/* USER TYPE */}
        <View style={styles.userTypeRow}>
          <Text style={styles.userTypeLabel}>User type:</Text>

          <View style={styles.userTypeContainer}>
            <Pressable
              onPress={() => setUserType("artist")}
              style={[
                styles.userTypeButton,
                userType === "artist" && styles.userTypeButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.userTypeText,
                  userType === "artist" && styles.userTypeTextSelected,
                ]}
              >
                Artist
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setUserType("gallery")}
              style={[
                styles.userTypeButton,
                userType === "gallery" && styles.userTypeButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.userTypeText,
                  userType === "gallery" && styles.userTypeTextSelected,
                ]}
              >
                Gallery
              </Text>
            </Pressable>
          </View>
        </View>

        {/* DYNAMIC QUESTIONS */}
        {userType && (
          <View style={styles.questionBlock}>
            {QUESTION_BANK[userType].map((q) => (
              <View key={q.key}>
                <Text>{q.label}</Text>
                <TextInput
                  style={styles.input}
                  value={answers[q.key] || ""}
                  onChangeText={(text) => handleAnswerChange(q.key, text)}
                />
              </View>
            ))}
          </View>
        )}

        <Pressable
          style={styles.button}
          onPress={() => console.log(username, profile_pic, userType, answers)}
        >
          <Text style={styles.buttonText}>Create Account</Text>
        </Pressable>

        {/* SUBMIT */}
        {/* <Pressable style={styles.button} onPress={handleCreateProfile}>
          <Text style={styles.buttonText}>Create Account</Text>
        </Pressable> */}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  defaultImageStyle: {
    backgroundColor: "white",
    padding: 10,
  },
  userImageStyle: {
    backgroundColor: "transparent",
  },
  button: {
    width: "100%",
    padding: 14,
    backgroundColor: "black",
    borderRadius: 12,
    marginTop: 20,
    alignItems: "center",
  },

  buttonText: {
    color: "white",
    fontWeight: "600",
  },

  userTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-between",
    marginVertical: 2,
  },

  userTypeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4d4139",
  },

  background: {
    flex: 1,
  },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  container: {
    alignItems: "center",
    paddingHorizontal: 30,
    paddingTop: 80,
    paddingBottom: 60,
  },

  title: {
    fontFamily: "Euphoria",
    fontSize: 50,
    fontWeight: "bold",
    color: "#4d4139",
    marginBottom: 20,
  },

  backButton: {
    position: "absolute",
    top: 40,
    left: 10,
    zIndex: 20,
  },

  imageWrapper: {
    width: 180,
    height: 180,
    marginBottom: 20,
  },

  imageContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 90,
    padding: 2,
    backgroundColor: "black",
  },

  profileImage: {
    width: "100%",
    height: "100%",
    borderRadius: 100,
  },

  plusButton: {
    position: "absolute",
    bottom: -5,
    right: -5,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  userTypeContainer: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 20,
  },

  userTypeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#888",
    backgroundColor: "white",
  },

  userTypeButtonSelected: {
    backgroundColor: "black",
    borderColor: "black",
  },

  userTypeText: {
    color: "black",
    fontWeight: "600",
  },

  userTypeTextSelected: {
    color: "white",
  },

  questionBlock: {
    width: "100%",
    marginBottom: 20,
  },

  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 5,
    backgroundColor: "white",
  },
});
