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

import { useState } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";

export default function NewUserScreen() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [profile_pic, setImage] = useState<string | null>(null);
  const [userType, setUserType] = useState<"artist" | "gallery" | null>(null);

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
              source={
                profile_pic
                  ? { uri: profile_pic }
                  : require("@/assets/images/profile_upload_7.png")
              }
              style={styles.profileImage}
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

        {/* USERNAME */}
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />

        {/* USER TYPE ROW */}
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

        {/* ARTIST QUESTIONS */}
        {userType === "artist" && (
          <View style={styles.questionBlock}>
            <Text>What type of art do you create?</Text>
            <TextInput style={styles.input} />

            <Text>How many years have you been creating art?</Text>
            <TextInput style={styles.input} />
          </View>
        )}

        {/* GALLERY QUESTIONS */}
        {userType === "gallery" && (
          <View style={styles.questionBlock}>
            <Text>What is your gallery name?</Text>
            <TextInput style={styles.input} />

            <Text>Where is your gallery located?</Text>
            <TextInput style={styles.input} />
          </View>
        )}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  userTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-between",
    marginVertical: 20,
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
    borderRadius: 90,
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
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: "white",
  },
});
