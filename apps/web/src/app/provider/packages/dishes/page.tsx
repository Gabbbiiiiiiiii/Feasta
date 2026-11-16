import {loadDishLibrary} from "../dish-library-actions";
import {ProviderDishLibrary} from "../provider-dish-library";

export default async function ProviderDishListPage() {
  const library = await loadDishLibrary();
  return <ProviderDishLibrary initialLibrary={library} />;
}
