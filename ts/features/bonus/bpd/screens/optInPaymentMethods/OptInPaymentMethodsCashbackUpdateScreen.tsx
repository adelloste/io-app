import { useNavigation } from "@react-navigation/native";
import { Text, View } from "native-base";
import React from "react";
import {
  Image,
  ImageSourcePropType,
  SafeAreaView,
  ScrollView,
  StyleSheet
} from "react-native";
import dafaultLogo from "../../../../../../img/bonus/bpd/logo_cashback_blue.png";
import ButtonDefaultOpacity from "../../../../../components/ButtonDefaultOpacity";
import { IORenderHtml } from "../../../../../components/core/IORenderHtml";
import { H2 } from "../../../../../components/core/typography/H2";
import { IOStyles } from "../../../../../components/core/variables/IOStyles";
import BaseScreenComponent from "../../../../../components/screens/BaseScreenComponent";
import FooterWithButtons from "../../../../../components/ui/FooterWithButtons";
import I18n from "../../../../../i18n";
import { useIODispatch, useIOSelector } from "../../../../../store/hooks";
import {
  getBPDMethodsSelector,
  paymentMethodsSelector
} from "../../../../../store/reducers/wallet/wallets";
import { confirmButtonProps } from "../../../bonusVacanze/components/buttons/ButtonConfigurations";
import { availableBonusTypesSelectorFromId } from "../../../bonusVacanze/store/reducers/availableBonusesTypes";
import { ID_BPD_TYPE } from "../../../bonusVacanze/utils/bonus";
import { navigateToOptInPaymentMethodsChoiceScreen } from "../../navigation/actions";
import {
  optInPaymentMethodsCompleted,
  optInPaymentMethodsFailure
} from "../../store/actions/optInPaymentMethods";

const styles = StyleSheet.create({
  logo: {
    resizeMode: "contain",
    width: 48,
    height: 46
  },
  headerContainer: {
    ...IOStyles.row,
    justifyContent: "space-between"
  }
});
const OptInPaymentMethodsCashbackUpdateScreen = () => {
  const navigation = useNavigation();
  const dispatch = useIODispatch();
  const bpdPaymentMethods = useIOSelector(getBPDMethodsSelector);
  const paymentMethods = useIOSelector(paymentMethodsSelector);
  const bpdInfo = useIOSelector(availableBonusTypesSelectorFromId(ID_BPD_TYPE));
  const bpdLogo: ImageSourcePropType = bpdInfo?.cover
    ? { uri: bpdInfo?.cover }
    : dafaultLogo;

  // This screen should be shown only if the payment method are correctly loaded
  if (paymentMethods.kind !== "PotSome") {
    dispatch(optInPaymentMethodsFailure("error in the payment method loading"));
  }

  const handleOnContinuePress = () => {
    if (bpdPaymentMethods.length > 0) {
      navigation.dispatch(navigateToOptInPaymentMethodsChoiceScreen());
    } else {
      dispatch(optInPaymentMethodsCompleted());
    }
  };

  return (
    // The void customRightIcon and customGoBack are needed to have a centered header title
    <BaseScreenComponent
      showChat={false}
      goBack={false}
      headerTitle={I18n.t(
        "bonus.bpd.optInPaymentMethods.cashbackUpdate.header"
      )}
      customRightIcon={{
        iconName: "",
        onPress: () => true
      }}
      customGoBack={
        <ButtonDefaultOpacity onPress={() => true} transparent={true} />
      }
    >
      <SafeAreaView
        style={IOStyles.flex}
        testID={"OptInPaymentMethodsCashbackUpdate"}
      >
        <ScrollView style={[IOStyles.horizontalContentPadding]}>
          <View style={styles.headerContainer}>
            <View style={IOStyles.flex}>
              <H2>
                {I18n.t("bonus.bpd.optInPaymentMethods.cashbackUpdate.title")}
              </H2>
              <Text>
                {I18n.t(
                  "bonus.bpd.optInPaymentMethods.cashbackUpdate.subtitle"
                )}
              </Text>
            </View>
            <Image source={bpdLogo} style={styles.logo} />
          </View>
          <View spacer />
          <IORenderHtml
            source={{
              html: I18n.t("bonus.bpd.optInPaymentMethods.cashbackUpdate.body")
            }}
            renderersProps={{
              ul: {
                markerBoxStyle: {
                  paddingRight: 10
                }
              }
            }}
            tagsStyles={{
              li: {
                lineHeight: 20
              }
            }}
          />
        </ScrollView>
        <FooterWithButtons
          type={"SingleButton"}
          leftButton={confirmButtonProps(
            handleOnContinuePress,
            I18n.t("global.buttons.continue"),
            undefined,
            "continueButton"
          )}
        />
      </SafeAreaView>
    </BaseScreenComponent>
  );
};

export default OptInPaymentMethodsCashbackUpdateScreen;
